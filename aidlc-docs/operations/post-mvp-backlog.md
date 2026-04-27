# Post-MVP バックログ

**目的**: MVP 本番稼働後に着手する改善・整理項目の一元管理。致命度は低いが放置すると負債化する案件を記録する。

**運用**:
- 着手時は関連 PR 番号を記載し、完了したら該当項目を削除する
- 新規項目は「発見日: YYYY-MM-DD / 発見元セッション」を添える
- 優先度は 高 / 中 / 低 の 3 段階。高は 1 ヶ月以内、中は 3 ヶ月以内、低はいつでも

---

## 未解決バグ

(現在なし)

---

## 脆弱性対応 / 依存更新

### 🔴 高: Next.js 14 → 15 major upgrade + drizzle-orm 0.30 → 0.31+ upgrade
- **発見日**: 2026-04-22 (Phase C CI GREEN 化中に OSV-Scanner の CVE 一斉発覚)
- **期限**: 2026-06-30 (MVP ローンチから約 2 ヶ月)
- **背景**: Next.js 14.2 系の 5 CVE (High 2 + Medium 3) と drizzle-orm 0.30.10 の 1 High CVE が、それぞれ 14.2 最終 patch / 0.30 最終 patch で fix 対応していない。major upgrade (Next.js) / minor upgrade (drizzle-orm) が必要
- **MVP β 期間の allowlist 根拠**:
  - vitanota は多層防御 (CloudFront secret 強制化 + WAF rate limit + 招待制 + RLS + session 8h) により実効リスクを中弱に抑制
  - SSRF は VPC Private Isolated で外部到達不能、Cache 系は CachingDisabled で影響ゼロ
  - drizzle SQL Injection は parameterized API のみ使用で実効リスク低
  - 詳細な CVE 別評価は `osv-scanner.toml` の各 reason 欄
- **upgrade 手順 (推定工数 2-4 日)**:
  1. Next.js 14 → 15 migration (React 19 含む、App Router / Middleware signature 変更追従)
  2. drizzle-orm 0.30 → 0.31+ migration (schema API 変更確認)
  3. 統合テスト + E2E regression 確認
  4. 本番 deploy (CloudFront + App Runner)
- **運用監視**: 月次で OSV-Scanner 結果を review、新 CVE 発生 or severity 上方修正時は個別対応判断

---

## Auth / OAuth

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
- **判断メモ (2026-04-22)**: MVP 前に skip で chimo と合意。理由: (1) VPC private isolated + SG 制限で MITM 経路が実質存在しない (2) 本番 DB 接続を MVP 直前に触るリスクが defense in depth の得られる価値を上回る (3) 誤設定時はローカル検証不能 + 本番一発勝負。Phase 2 で慎重に導入 (推奨方式: `DB_SSL_STRICT=true` の OR 条件で段階導入し fallback 可能に)

---

## インフラクリーンアップ (β ローンチ後すぐ)

出典: `aidlc-docs/operations/infrastructure-audit-20260419.md`

(すべて 2026-04-22 に完遂済: 旧 VPC Connector 削除 / 旧 Secret 判定撤回 / NAT Instance + PUBLIC subnet + IGW 完全撤廃)

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

## CI / テスト

### 🔴 高: 統合テストの DB schema 追従 (main の CI が常時赤)
- **発見日**: 2026-04-27
- **現状**: `__tests__/integration/*.test.ts` (session-strategy / tenant-isolation 等) で `relation "tags" does not exist` エラー多発。`0016_tags_to_emotion_tags.sql` で `tags` → `emotion_tags` にリネームされて以降、統合テストが追従されていない
- **影響**: **main の CI が連続 8 commit 以上 failure**。「CI で何かが壊れてもアラートが出ない」状態 = 防衛機能ゼロ。今後の変更で何が壊れたか判別できなくなる
- **対策**:
  1. `__tests__/integration/` の全テストで `tags` テーブル参照を `emotion_tags` (and Drizzle スキーマ `emotionTags`) に書き換え
  2. CI で integration test を green に
  3. main への push で CI が連続赤の状態を block する運用ルール検討 (例: required check 設定)
- **着手判断**: ローンチ後すぐ。長く放置するほど追従コストが増える

---

## 戦略的検討事項

### ECS Express Mode への移行検討
- **出典**: `aidlc-docs/construction/migration-apprunner-to-ecs-express.md`
- **現状**: App Runner で安定稼働中。当時 App Runner 終了通知 (後に撤回) と外向き通信の NAT 要件で移行検討されたが、認証外部化 (Lambda Proxy) により後者は解決済
- **判断保留**: 現状 AppRunner の実運用コスト・制約を継続観測。明確な必要性が生じるまで **塩漬け**
- **着手条件**: App Runner の再価格改定・スケーリング上限 hit・未知の障害が頻発する等
- **判断メモ (2026-04-22)**: chimo と確認。ECS 移行すると ALB ($17/月) + NAT Gateway ($33/月) で **月 $23-40 増**、実利なし。AppRunner 新規受付停止 (2026-04-30) は既存稼働に影響なく、AWS 終了告知時は 12-24 ヶ月の移行猶予が通例。よって塩漬け継続で合意

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

## 機能拡張候補

### 🔴 高 (5月リリース予定): 先週のvitanotaレポート 機能の復活
- **発見日**: 2026-04-23 → 4月公開 retreat → **5月リリース予定**: 2026-05-XX
- **経緯**:
  - 2026-04-27 に実装 + 本番デプロイまで完了したが、**AppRunner VPC egress 不可問題** で AI 呼出しが APIConnectionError → 機能不全
  - Lambda Proxy 経由で回避を試みたが、AppRunner → Function URL も VPC 制約で到達不可と判明 (= Google OAuth Lambda はブラウザ経由なので動くが、server-to-server では動かない)
  - chimo 判断で 4月公開からは退避 → 5月リリースで再アプローチ
- **設計書**: [`construction/weekly-summary-design.md`](../construction/weekly-summary-design.md) (実装内容は仕様確定済)
- **現状の本番 (4月公開時点)**:
  - UI: ダッシュボードタブ「先週のvitanotaレポート」は **disabled の ComingSoonTab** 表示 (時間割と同じパターン)
  - DB: `journal_entries.content_masked` カラム + `journal_weekly_summaries` テーブルは適用済 (= データなし、害なし、5月で再利用)
  - Secret: `vitanota/anthropic-api-key` 残置 (値設定済)
  - コード資産: WeeklySummaryTab / weeklySummaryService / mask-content / API endpoint / seed-hanako.sh は残置

- **⚠️ コードと CFN の drift (= 段階剥がしを諦めた帰結、5月で必ずクリーンアップ)**:
  - **コード (main 最新 = `b767bec`)**: `f288a33` 状態 (Lambda Proxy 関連は revert 済、AppRunner env は `ANTHROPIC_API_KEY` 注入想定)
  - **本番 CFN (= `vitanota-prod-app` + `vitanota-prod-data-shared`)**: `5d44d29` 状態 (Lambda Proxy 関連が残置)
    - `data-shared`: AnthropicProxy Lambda + AnthropicProxySecret + Function URL がデプロイ済 (= 誰も呼ばない、無害)
    - `app`: AppRunner runtimeEnvironmentVariables に `ANTHROPIC_PROXY_URL` 注入、runtimeEnvironmentSecrets に `ANTHROPIC_PROXY_SECRET` + `ANTHROPIC_API_KEY_LEGACY` 注入 (アプリは未参照)
    - app.instanceRole: `anthropicProxySecret.grantRead` 残置
  - **drift が起きた理由**: コード revert 後に `cdk deploy app` を実行すると CFN export (Function URL) の削除を試みるが、export を import 中の app stack の旧 deploy 状態と循環 deadlock → rollback。段階剥がし (2 commit + 2 deploy) で回避可能だが、UI tab disabled で機能影響ゼロのため 5月送り

- **5月で必要な作業**:
  1. **Anthropic 接続戦略を確定**:
     - 案 A: NAT Gateway 追加 (foundation-stack)、+¥4,800/月、最もシンプル
     - 案 B: ブラウザ → Lambda Proxy 経由、ただし集計データがクライアントに流れる (踏み絵チェック必要)
     - 案 C: Anthropic Bedrock 経由 (= AWS API、VPC endpoint 経由で到達可能、Bedrock の Claude モデル価格次第)
  2. **インフラ drift クリーンアップ** (= コードと CFN を一致させる):
     - 案 A を採用する場合: 既存 AnthropicProxy Lambda + Secret + AppRunner PROXY env を削除。`段階剥がし` 必須 (詳細手順は本セッションログ `audit.md` 参照、もしくは: 一時的に app stack で PROXY env を維持しつつ ANTHROPIC_API_KEY 注入を追加 → cdk deploy app → 別 commit で PROXY 完全削除 → cdk deploy app + data-shared)
     - 案 B/C を採用する場合: AnthropicProxy 関連は既存資産として再利用 (案 B) or 一旦削除して別経路に (案 C)
  3. **UI 復活**: `pages/dashboard/index.tsx` の `weekly` タブを ComingSoonTab → `<WeeklySummaryTab />`、`disabled` 削除、import コメント解除
  4. **ローカル + 本番動作確認**

### 🟢 低: 既存 journal_entries の content_masked を batch backfill
- **発見日**: 2026-04-27
- **現状**: 週次レポート機能 MVP では「on-the-fly mask」(AI 入力時に `content_masked IS NULL` なら maskContent をその場で呼ぶ) で対応中。新規投稿は API 側で content_masked が常に埋まる
- **影響**: 既存投稿が大量にある場合、週次サマリ生成時のレスポンスが遅くなる可能性 (1 ユーザー × 1 週で数件〜十数件マスク = 数 ms〜数十 ms で問題ないが、scale が増えれば気になる)
- **対策**: TS スクリプト (`scripts/backfill-content-masked.ts`) で全 entries に対して maskContent を適用 → content_masked カラムを埋める。dotenv or @next/env で local DB 接続、本番は CDK migration job 内で 1 回だけ実行
- **設計書**: [`construction/weekly-summary-design.md`](../construction/weekly-summary-design.md) § 9.3

### 🟡 中: 週次レポート自動生成 Lambda (EventBridge cron)
- **発見日**: 2026-04-27
- **現状**: MVP では「アクセス時自動生成」(初回 GET /api/me/weekly-summary でその場で生成 + DB 保存)
- **影響**: 月曜にアクセスがないと、火曜以降の初回アクセス時に生成。ユーザー体験はほぼ問題ないが、「常に月曜時点で fresh な summary がある」とは保証されない
- **対策**: EventBridge Scheduler + Lambda で月曜 0:00 JST に全 active user 分を batch 生成 → DB 保存。アクセス時は既存を返すだけになる
- **設計書**: [`construction/weekly-summary-design.md`](../construction/weekly-summary-design.md) § 17 (Phase 2)

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
