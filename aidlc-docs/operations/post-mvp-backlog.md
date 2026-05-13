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

### 🟡 中: 加入済み教員のロール変更機能 (兼務 / 置換 / 取消)
- **発見日**: 2026-05-06 (説明会前のスライド作業中に派生)
- **着手判断**: 5/7 説明会後
- **現状**: `user_tenant_roles` は `(user_id, tenant_id, role)` UNIQUE で複数ロール持てる設計 (兼務対応済) だが、加入後にロールを変更する API / UI は未実装。`/admin/invitations` は招待トークン一覧で「招待時ロール」しか表示しない
- **実装パターン (推奨 = A)**:
  - **A**: `/admin/invitations` の accepted 行に「現在のロール」列 + ロール変更 UI 追加 (画面新設不要、3〜4h)
  - B: 新画面 `/admin/teachers` (user_tenant_roles ベース) を新設 (5〜7h)
  - C: A + 「招待時ロール」と「現在ロール」を別列で並べて変化を可視化 (4〜5h)
- **設計の主要論点 (着手時に決定)**:
  - 変更方針 (兼務追加 / 単一置換 / 任意組合せ)
  - ダウングレード (school_admin → teacher) の可否
  - 自分のロール変更ガード (= 最後の school_admin が消えるシナリオ防止)
  - RLS ポリシー (school_admin が user_tenant_roles を更新できる確認 or 追加)
- **踏み絵チェック**: 管理者間の操作のみ、教員に観測されてる感を生まない → 踏み絵リスクなし

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

### 🔴 高: E2E test (Playwright) 16 件の現行 UI / DB schema 追従
- **発見日**: 2026-05-04 (fix/ci-green 着手中、ローカル実走 16 failed / 10 passed を確認)
- **影響**: CI workflow の `E2E Tests (Playwright)` ジョブが常時赤。本番動作には影響しないが、回帰検出能力ゼロ。今後の UI / API 改修で何が壊れたか判別不能
- **失敗内訳と原因** (16 件):
  - **01-auth: 1 件** — `/journal` route 不在 (現行は `/`)。修正: 該当 test の goto 先を `/` に
  - **02-journal-crud: 6 件** — `/journal/new` / `/journal/mine` route 不在。現行 UI は timeline (`/`) 上部に常駐する compact form (mood 絵文字選択 → expand → textarea) で投稿。修正: route 追従 + compact form の操作シーケンス (mood click → fill content → submit) に書き換え
  - **03-timeline: 4 件** — `/journal/new` / `/journal/mine` route 不在 (同上)
  - **04-tags: 5 件** — 全 test が beforeEach の createTag で 400 cascade fail。原因 2 つ: (a) `helpers/seed.ts` の createTag が `type` field を渡してるが現行 `_seed.ts` Zod に未定義 (silent ignore で実害ないが古い)、`category: params.category ?? null` の null fallback が `z.enum(['positive','negative','neutral'])` と非互換、(b) spec が `'授業準備'` (`type: 'context'`) タグを前提にしているが migration 0016 で `tags → emotion_tags` rename + emotion 専用化、context は廃止概念
- **修正方針**:
  1. `helpers/seed.ts` createTag: `type` field 削除、`category` を required に変更 (Zod と一致させる)
  2. `04-tags.spec.ts`: '授業準備' タグ前提の test (`感情タグと業務タグが視覚的に区別される` 等) を削除 or emotion-only に書き換え
  3. 02 / 03 / 04 spec の `/journal/new` / `/journal/mine` 前提を現行の compact form (`/`) に rewrite
  4. 01-auth の `/journal` リダイレクト test を現行のリダイレクト先 (`/`) に追従
  5. ローカルで `pnpm test:e2e` GREEN 確認、CI も GREEN 化
- **工数**: 5-15 時間 (rewrite に近い、各 spec の手動操作シーケンス再構築 + selector 追従 + データ準備)
- **着手判断**: 5/7 説明会後の安定期。CI required check 設定の検討も併せて
- **passed 10 件 (現状動いてる)**: 01-auth 基本 3 / 05-multi-tenant 全件 / 06-is-public-leak 全件。これらは route 影響なしで通ってる、回帰防御線として機能

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

### 🟡 中: 日々ノートタブに新着マーク (未読バッジ)
- **発見日**: 2026-05-04
- **背景**: 共有タイムラインに新しい投稿があっても、現状は「日々ノート」タブを開きにいかないと気づけない。tab ラベルに小さなドット or 件数バッジを出して "新着あり" を示したい
- **設計検討**:
  - **判定基準**: 自分が最後に「日々ノート」タブを開いた時刻 (= last_read_at) より後に他人が投稿したかどうか。`localStorage` に last_read_at を保持するか、サーバー側で users.last_journal_read_at カラムを持たせるか
  - **粒度**: 件数バッジ (例: `日々ノート (3)`) or ドットだけ (例: `日々ノート ●`)。ドットの方が控えめで踏み絵 (観測感) と整合
  - **対象**: 共有タイムラインのみ (マイ記録は自分の投稿だから新着判定不要)
- **裏テーマ踏み絵 (`feedback_observed_moment_broken`)**: 「他の先生が投稿してくれた」を軽く伝える程度に留める。「○○先生が新規投稿!」の明示通知や音は NG
- **着手判断**: 5/7 説明会後

### 🟡 中: タスクボードの期間絞り込み
- **発見日**: 2026-05-04
- **背景**: 現状 TaskBoard は全期間の未完タスク + 完了済タスクを混在表示。「今週」「今月」「期限切れ」等で絞り込めると、教員が頭を整理しやすい
- **設計検討**:
  - フィルター UI 案: 既存の AssigneeFilter / TagFilter の隣に PeriodFilter を追加。値: `今週 / 今月 / 期限切れ / 期限なし / すべて` 等
  - 判定: `tasks.due_date` 基準でクライアント側 filter (件数少ないので server side filter は不要)。ただし期限切れの判定は今日との比較で日次変わる → useMemo で当日キャッシュ
  - 「完了済」を別途隠す toggle と独立させるか議論
- **着手判断**: 5/7 説明会後、現場で「タスクが多すぎて見づらい」フィードバックが出たら優先度上げ

### 🟢 低: 「vitanotaとは」モーダルにスライド (複数ページ) を入れる
- **発見日**: 2026-05-04
- **現状**: `AboutVitanotaModal.tsx` は 1 枚の画像で世界観を伝えてる
- **背景**: 説明会・新規導入校向けに複数ページのスライド (左右ナビで切替) で各機能・思想を順に見せたい
- **設計検討**:
  - 既存画像をスライド 1 枚目として残しつつ、新規スライドを追加する形
  - ナビゲーション: 左右ボタン or インジケータ点
  - 中身: 「vitanota の思想」「日々ノート」「タスクボード」「学校レポート」「フィードバック」など 4-6 枚
- **着手判断**: 説明会導入校が増えるタイミング、または校長導入 (kamitokusari ニセコ) 後の運用フィードバック取り

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

### 🔴 高: system_admin「AI 改善」分析画面 (H1 検証 Phase B「見る」)
- **発見日**: 2026-05-13
- **着手予定**: 2026-05-14 (chimo 指示、明日着手)
- **現状**: H1 検証 MVP デプロイ済。`ai_sessions.ai_output_json` に必要データはすべて入っている (jsonb 集計可能) が、集計画面は未実装。chimo が手動で psql query する状態
- **影響**: H1 検証の主指標 (タスク候補作成確定率 / 整理スコア平均) と副指標 (修正率系) を継続観測できない。改善材料の抽出が手動・属人的
- **対策**: system_admin 専用画面 `/admin/ai-analytics` 新設。下記指標を jsonb 集計クエリで表示
- **指標一覧 (chimo 構想 Phase B)**:
  - タスク候補作成確定率 (H1 主指標) — `status='confirmed'` / 全 sessions
  - 整理されたスコア平均 (H1 主指標) — `ai_output_json.survey.organizeScore` AVG
  - 破棄率 — `status='discarded'` / 全
  - カテゴリ修正率 — `userConfirmed[].categoryChanged` TRUE 比率
  - タイトル修正率 — `userConfirmed[].titleChanged` TRUE 比率
  - 期限修正率 — `userConfirmed[].dueDateChanged` TRUE 比率
  - prompt_version 別成果 — `ai_output_json.promptVersion` で group + 上記指標 × 版
  - カテゴリ別修正率 — `userSelectedParentName × categoryChanged` で group
  - 破棄理由ランキング — `ai_output_json.discardReason` COUNT by reason
  - 編集理由ランキング — `ai_output_json.editReason` COUNT by reason
- **裏テーマ踏み絵**: 個人特定可能な集計は不可 (`feedback_observed_moment_broken`)。system_admin のみ閲覧、テナント横断 aggregate のみ。input_text を直接読むのは緊急 debug 時のみ
- **関連 memory**: `project_phase1_core_experience` `project_ai_sessions_visibility` `project_ai_strategy_20260511`

### 🟡 中: AI 整理 Phase C-E (辞書・カテゴリルール・プロンプトバージョン・フラグの DB 化)
- **発見日**: 2026-05-13
- **着手予定**: 2026-05-14 以降 (chimo 指示、明日着手分の延長)
- **現状**: 各種定義がコード内 hardcode。`categoryDefinitions.ts` / `'v1-2026-05-13'` プロンプトバージョン / env 変数フラグ
- **影響**: chimo の長文構想「使われるたびに育つ設計」(Phase A → B → C → D → E) のうち、A (記録) は実装済、B (分析画面) も明日対応予定。**C 以降に進むには各種定義の DB 化が前提**
- **対策段階**:
  - **C1: 専用テーブル化** — `ai_task_capture_sessions` / `ai_task_candidates` (現状 JSONB を正規化、集計効率化)
  - **C2: 学校用語辞書** — `tenant_ai_glossary` (term / normalized_meaning / preferred_category_id、school_admin or system_admin が編集)
  - **C3: カテゴリ AI ルール DB 化** — `category_ai_rules` (description / examples / keywords / exclude_examples、テナント別上書き可)
  - **C4: プロンプトバージョン管理** — `ai_prompt_versions` (system_prompt / output_schema / is_active、A/B 検証可)
  - **C5: AI 機能フラグ管理画面** — 既存 backlog 「AI チャット機能の有効化フラグの管理画面化」と統合。env → DB feature_flags へ
  - **D: 承認フロー** — 「『進調』を辞書に追加しますか?」型の system_admin / school_admin 承認 UI
  - **E: 自動反映** — 十分な safety net の後、一部のみ自動反映
- **裏テーマ踏み絵**: 「AI = 観測装置」にしない (`feedback_observed_moment_broken`)。教員へのコメント・励まし禁止 (`feedback_ai_output_guards`)。mood に AI 触らせない (`feedback_mood_ai_untouchable`)
- **既存 backlog との統合**: 「AI チャット機能の有効化フラグの管理画面化」(同日 backlog 行き) は C5 と同件、本項目に内包される
- **関連 memory**: `project_ai_strategy_20260511` (構想原典)、`project_ai_chat_feature_flag` (env 2 段の現行設計)、`project_phase1_core_experience` (Phase 概念)

### 🟡 中: AI チャット機能の有効化フラグの管理画面化
- **発見日**: 2026-05-13
- **現状**: `ENABLE_AI_CHAT_EXTRACTION` + `AI_CHAT_ALLOWLIST_TENANT_IDS` の 2 段 env で制御 (AppRunner 環境変数)。テナント追加のたびに CSV 文字列を更新 + AppRunner 再起動 (~3 分)。緊急停止は `ENABLE_AI_CHAT_EXTRACTION=false` で全テナント即時 OFF
- **影響**: テナント追加に deploy 権限と AppRunner 再起動が必要。校長動線で対応校が増えると運用負荷が線形に増える
- **対策**: system_admin 専用画面 (例: `/admin/feature-flags`) で DB ベースのフラグ管理に移行。`feature_flags` テーブル + `feature_flag_tenants` 関連テーブル + RLS。即時反映、deploy 不要
- **着手判断**: allowlist 対象テナントが 10 件超えた時点、または「申請から 3 営業日以内に AI 機能 ON」要求が校長動線で出た時点で優先度を上げる。それまで env 運用で十分
- **裏テーマ踏み絵**: 「機能 ON/OFF」自体は運用情報 (踏み絵ではない)。ただし「AI 利用量」「ON 履歴」を school_admin 閲覧可能にしない (= 観測者原則の対象)。管理画面は system_admin 専用とし RLS 設計を踏襲
- **関連 memory**: `project_ai_chat_feature_flag.md`

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
