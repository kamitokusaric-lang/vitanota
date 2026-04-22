# Post-MVP バックログ

**目的**: MVP 本番稼働後に着手する改善・整理項目の一元管理。致命度は低いが放置すると負債化する案件を記録する。

**運用**:
- 着手時は関連 PR 番号を記載し、完了したら該当項目を削除する
- 新規項目は「発見日: YYYY-MM-DD / 発見元セッション」を添える
- 優先度は 高 / 中 / 低 の 3 段階。高は 1 ヶ月以内、中は 3 ヶ月以内、低はいつでも

---

## Auth / OAuth

### 🟡 中: Google Client ID の 3 重ハードコード解消
- **発見日**: 2026-04-21
- **現状**: `infra/lib/app-stack.ts:104,108` で 2 箇所 + GitHub variable の計 3 箇所に同値ハードコード
- **理由**: Secret ローテ時の変更漏れリスク、変更箇所が散らばる
- **対策**: Secrets Manager `vitanota/google-client-id` に一元化し、環境変数は `runtimeEnvironmentSecrets` で注入

### 🟢 低: Lambda inline code を一貫して別ファイル化 (3 Lambda)
- **発見日**: 2026-04-21 / 2026-04-22 に範囲拡張
- **現状**: 以下 3 Lambda すべて `lambda.Code.fromInline` を使っており inline 文字列リテラル
  - `infra/lib/data-shared-stack.ts:124` (GoogleTokenProxy, 88 行)
  - `infra/lib/data-core-stack.ts:93` (SnapshotManager)
  - db-migrator Lambda (推定同様、要確認)
- **理由**: syntax highlight なし、ESLint/Prettier 不適用、testability 低
- **対策**: `infra/lambda/<function-name>/index.js` の統一構造に分離、`lambda.Code.fromAsset` で参照
- **判断メモ (2026-04-22)**: chimo と「MVP 前に 1 Lambda だけ先行はやらない」で合意。3 Lambda まとめて別ファイル化するまで inline 維持。単独先行は一貫性を壊すだけで価値が出ない

### 🟢 低: ログアウト動作の E2E カバレッジ
- **発見日**: 2026-04-21 / 2026-04-22 に静的解析で設計完備を確認
- **現状**: `pages/api/auth/[...nextauth].ts` が NextAuth catch-all で `/api/auth/signout` を処理。DrizzleAdapter + database strategy で sessions 行削除 + cookie 無効化が自動で走る。`vitanota_app` に DELETE 権限あり (`0008_app_role_nosuper.sql:24`)、sessions は RLS 無効 (`0009_rls_role_separation.sql:168`、鶏卵問題回避のため意図的)。`events.signOut` で `LogEvents.SessionRevoked` を構造化ログに記録
- **ギャップ**: 実フローの integration / E2E テストなし (`TenantGuard.test.tsx` で mock のみ)
- **対策**: Playwright で `tests/e2e/signout.spec.ts` を追加 (ログイン → ログアウト → /auth/signin → 再アクセス拒否)。MVP 手動検証後に着手

---

## DB / 接続

### 🟡 中: 期限切れ session の自動クリーンアップ
- **発見日**: 2026-04-21
- **現状**: `migrations/0002_unit02_sessions.sql:40` にコメントで SQL あり、実装なし
- **影響**: 長期的にテーブル肥大化、インデックス劣化
- **対策**: EventBridge Scheduler + Lambda で日次実行 `DELETE FROM sessions WHERE expires < NOW() - INTERVAL '7 days'`

### 🟢 低: pg Pool の `idleTimeoutMillis` 見直し
- **発見日**: 2026-04-21
- **現状**: `src/shared/lib/db.ts:35` で 30 秒
- **影響**: idle 30 秒で connection が破棄され、次リクエストで新規 PAM 認証（コスト・レイテンシ）
- **対策**: 5〜10 分に緩和して再利用率を上げる。ただし max 10 で RDS connection 数との兼ね合いを確認

---

## インフラ整理

### 🟢 低: RDS SSL 証明書の `rejectUnauthorized: true` 化
- **発見日**: 2026-04-19 以前（既に `db.ts:31` にコメント記載）
- **現状**: `src/shared/lib/db.ts:29-31` で VPC 内通信のため false
- **対策**: RDS CA bundle を Docker イメージに同梱し true に切替

### 🟢 低: CloudFront CLOUDFRONT_SECRET 強制化
- **発見日**: 以前から TODO（`infra/lib/app-stack.ts:115` コメント）
- **現状**: PLACEHOLDER 運用で middleware が secret チェックをスキップ
- **対策**: クロスリージョン Secret (CloudFront=us-east-1 / Secret=ap-northeast-1) 問題を解決して有効化

---

## インフラクリーンアップ (β ローンチ後すぐ)

出典: `aidlc-docs/operations/infrastructure-audit-20260419.md`

### 🟡 中: AppRunner を PRIVATE_ISOLATED に戻し NAT Instance を削除
- **現状**: Lambda Proxy 導入で AppRunner から Google への直接通信が不要になった
- **影響**: `-$5.40/月` のコスト削減、attack surface 低減
- **対策**: VPC Connector を PRIVATE_ISOLATED サブネット版に戻し、NAT Instance と egress サブネットを削除

---

## Phase 2 インフラ強化

出典: `aidlc-docs/construction/deployment-phases.md` Phase 2

### 🟡 中: RDS Multi-AZ 化
- **現状**: 単一 AZ (コスト優先の MVP 構成)
- **対策**: スタンバイ AZ を追加し自動フェイルオーバー有効化
- **工数**: CDK 1 行変更 + RDS 停止を伴う切替 (約 10 分)

### 🟡 中: RDS Proxy 追加
- **現状**: アプリが直接 RDS に接続。環境変数名 `RDS_PROXY_ENDPOINT` だが Proxy 実体は無い
- **対策**: RDS Proxy を追加し、IAM 認証経由で App Runner / db-migrator から Proxy 経由の接続に切替
- **効果**: connection 枯渇耐性 + token キャッシュを Proxy 側に任せられる

### 🟡 中: dev / prod 環境分離
- **現状**: prod 環境のみ。dev 環境は未構築 (`APPRUNNER_SERVICE_ARN_DEV` 未設定で GHA deploy-dev が skip)
- **対策**: 別アカウント or 別 VPC で dev 構築、CDK stage 分離

### 🟢 低: 監視 Lambda 追加 (header-rotator / rds-connection-monitor)
- **現状**: CloudWatch アラーム 5 個のみ
- **対策**: `deployment-phases.md` Phase 2 に列挙された Lambda を実装

### 🟢 低: S3 監査ログ Object Lock 延長
- **現状**: 90 日
- **対策**: compliance 要件確認後、7 年に延長 (`deployment-phases.md` Phase 2)

### 🟢 低: CloudWatch アラーム拡充 (12+ 個)
- **現状**: 5 個 (5xx / RDS CPU / memory / WAF / 認証エラーは未実装)
- **対策**: Log Insights クエリベースアラームで認証失敗・DB 接続失敗等を追加

---

## ユーザーライフサイクル

出典: `aidlc-docs/construction/unit-02/nfr-design/operational-risks.md` R13〜R15

### 🟡 中: ユーザー退会 API の実装 (R13)
- **現状**: 手動 SQL のみ (`user-lifecycle-spec.md` 論点 M Phase 2)
- **対策**: `DELETE /api/system/users/:id` で `deleted_at` セット + セッション無効化

### 🟢 低: 物理削除バッチ (R14)
- **現状**: `deleted_at IS NOT NULL` の users が無期限残存 (30 日 grace period 未実装)
- **対策**: EventBridge + Lambda で日次実行、30 日経過後の行を物理削除

### 🟡 中: 退会者の公開エントリ匿名化処理 (R15)
- **現状**: 手動 SQL で `user_id = NULL` 更新。スキーマは対応済だが自動化なし
- **対策**: 退会 API 内で同一トランザクションで更新 or バッチ化

---

## 観測性

### 🟢 低: APM / 分散トレーシング導入 (R9)
- **現状**: pino 構造化ログのみ。トレース ID なし
- **対策**: 本番運用データ蓄積後、X-Ray or OpenTelemetry を検討

---

## 戦略的検討事項

### ECS Express Mode への移行検討
- **出典**: `aidlc-docs/construction/migration-apprunner-to-ecs-express.md`
- **現状**: App Runner で安定稼働中。当時 App Runner 終了通知 (後に撤回) と外向き通信の NAT 要件で移行検討されたが、認証外部化 (Lambda Proxy) により後者は解決済
- **判断保留**: 現状 AppRunner の実運用コスト・制約を継続観測。明確な必要性が生じるまで **塩漬け**
- **着手条件**: App Runner の再価格改定・スケーリング上限 hit・未知の障害が頻発する等

### Claude Code Review の段階導入
- **出典**: `aidlc-docs/operations/claude-code-review-rollout.md`
- **現状**: Phase 1 (最小構成) 未着手
- **判断**: 運用フェーズが落ち着いてから Week 1-2 で導入
- **コスト見込**: $15〜30/月

---

## ドキュメント整理

### 🟢 低: `aidlc-docs/construction/auth-externalization.md` の正本化
- **発見日**: 2026-04-21
- **現状**: 先頭に「Lambda Proxy に変更」注記のみ付けた暫定対応
- **対策**: 本文自体を新フロー前提に書き直す。誤情報リスクが低い程度に Auth 実装が枯れてから

### 🟢 低: `aidlc-docs/operations/session-handoff-20260420.md` の扱い
- **発見日**: 2026-04-21
- **現状**: Auth 修正時のセッション記録。docs-index.md で [HISTORY] として残存
- **対策**: 将来的に `aidlc-docs/operations/history/` サブディレクトリに退避
- **メモ (2026-04-22)**: `0421_tmp.md` は本バックログへ移植完了を確認後、削除済 (commit 予定)

### 🟡 中: stale ドキュメントの順次統合
- **発見日**: 2026-04-21
- **現状**: `docs-index.md` で [LEGACY] / [HISTORY] タグを付けた docs が複数ある
  - `construction/auth-externalization.md` (旧 Auth 設計)
  - `construction/migration-apprunner-to-ecs-express.md` (塩漬け)
  - `operations/session-handoff-20260420.md` (スナップショット)
- **対策**: 以下の順で整理
  1. auth-externalization.md → user-onboarding-flow.md に内容統合 (実装確定後)
  2. session-handoff-20260420.md → `operations/history/` サブディレクトリに移動
  3. migration-apprunner-to-ecs-express.md → AppRunner 継続が確定したら削除 or 「検討経緯」として縮約
- **着手判断**: Auth 実装が 1 ヶ月以上安定稼働し、ECS 移行判断が固まったら

---

## 関連リファレンス

- 招待フロー仕様: `aidlc-docs/construction/user-onboarding-flow.md`
- 認証外部化設計: `aidlc-docs/construction/auth-externalization.md`
- セッション引き継ぎスナップショット: `aidlc-docs/operations/session-handoff-20260420.md`
- デプロイフェーズ: `aidlc-docs/construction/deployment-phases.md`
- インフラ監査: `aidlc-docs/operations/infrastructure-audit-20260419.md`
- ECS 移行計画: `aidlc-docs/construction/migration-apprunner-to-ecs-express.md`
- Code Review ロールアウト: `aidlc-docs/operations/claude-code-review-rollout.md`
- ユーザーライフサイクル仕様: `aidlc-docs/construction/user-lifecycle-spec.md`
- 運用リスク台帳: `aidlc-docs/construction/unit-02/nfr-design/operational-risks.md`
