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

### 🟢 低: functions coverage threshold を 70% → 80% に戻す
- **発見日**: 2026-05-04
- **現状**: `vitest.config.ts` の coverage threshold を `functions: 70`、他 (lines / branches / statements) は 80% に設定。MVP 暫定で functions だけ甘くしてある
- **未カバー箇所**:
  - `src/features/tasks/lib/taskService.ts`: `duplicateTask` のみ test 済、`createTask / updateTask / deleteTask / listTasks / setTaskTags / setTaskAssignees` が未カバー
  - `src/features/journal/lib/errors.ts` / `src/features/tasks/lib/errors.ts`: 各 Error class の constructor が未 test
- **対策**: taskService の各 method にユニットテスト追加 → functions 80% に戻す
- **着手判断**: 5/7 説明会後の安定期、coverage 厳守ポリシー復元

### ✅ 完了: 統合テストの DB schema 追従 (2026-05-04 fix/ci-green ブランチで対応)
- testDb.ts truncateAll の tags → emotion_tags 置換、session-leakage.test.ts の SELECT FROM tags → emotion_tags 置換、加えて移行中に tenant 越境の脆弱性 (security_invoker 未設定) を発見 → migration 0028 で hotfix

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

### 🟡 中: タスク複数アサイン本実装 (M:N スキーマ化)
- **発見日**: 2026-05-02
- **背景**: 2026-05-07 教員向け説明会では「タスク複製」機能で 1 担当者複製を回避策として採用。本来の M:N (1 タスクに複数担当者) への移行は別途実施
- **影響**: 現状は 1 タスク 1 担当者 (`tasks.owner_user_id` 単数)、複製で同タスクを複数生成する運用 = 担当者間で「同じタスクを共有してる」感が薄い
- **対策**: `task_assignees` テーブル新設 (M:N) + RLS / API / UI / 既存タスクの `owner_user_id` → `assignees` 1 件目への migration
- **想定工数**: 4-6 日 (スキーマ変更 × RLS 再設計 × TaskBoard / TaskForm / AssigneeFilter / useAssignees の改修 + テスト網羅)
- **裏テーマ踏み絵**: 複数アサイン自体は OK (分担は学校現場の自然)。ただし「誰がサボってる」が見えやすくなる UI は NG → 進捗は個人別ではなくタスク単位の完了/未完了で表示する設計を維持
- **着手判断**: 5/7 説明会後、教員からのフィードバック (新設 feedback 機能経由) で「複製運用が辛い」「同じタスクを共同で管理したい」と確認できたら優先度上げ。フィードバック無いなら現状維持で塩漬け継続

### ⚪ 凍結 (2026-04-27 撤回): 先週のvitanotaレポート 機能
- **撤回判断**: 2026-04-27、chimo 判断で AI 機能の使い所を再検討するフェーズに入ったため、Anthropic 接続を全面撤回。「AI ツールを使うこと自体に意味がある」前提で配置すると裏テーマ (観測されてると思われた瞬間に壊れる) を踏みかねないと判断。校長導入 (2026-05-04 週) 前のコード / CFN drift 解消も同時に達成。
- **撤回 baseline**: `pre-anthropic-removal-baseline` tag (= 2026-04-27 撤回直前の main HEAD)
- **撤回でやったこと**:
  - アプリコード: `anthropic-client.ts` / `weeklySummaryService.ts` / `mask-content.ts` / `WeeklySummaryTab.tsx` / `pages/api/me/weekly-summary.ts` / dashboard `weekly` タブ / 関連 tests / `seed-hanako.sh` の AI コメント / `@anthropic-ai/sdk` dependency を全削除
  - CFN: `vitanota-prod-app` (env 3 個 + IAM grant 2 個) / `vitanota-prod-data-shared` (AnthropicProxy Lambda + AnthropicProxySecret + AnthropicApiKey + Function URL + IAM Role/Policy) を `--exclusively` 段階剥がしで本番削除
  - Secret: `vitanota/anthropic-api-key` 完全削除 (CFN destroy 時に同時削除確認)
- **残置したもの (将来 AI 再開時の流用余地)**:
  - DB: `journal_entries.content_masked` カラム + `journal_weekly_summaries` テーブル (本番に残、データなし、害なし)
  - 設計書: [`construction/weekly-summary-design.md`](../construction/weekly-summary-design.md) ([LEGACY] マーク、参照用)
  - ローカル `.env.local` の `ANTHROPIC_API_KEY` (chimo 指示)
- **再開時に必要な作業**:
  1. AI 機能の使い所 (どこで・なぜ・誰のために) を再設計
  2. 接続経路を確定 (案 A: NAT GW / 案 B: ブラウザ Proxy / 案 C: Bedrock jp profile - 過去調査結果は `audit.md` 参照)
  3. 残置 DB スキーマを再利用 or 別設計
  4. `pre-anthropic-removal-baseline` tag のコードを参照しつつ再実装

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
