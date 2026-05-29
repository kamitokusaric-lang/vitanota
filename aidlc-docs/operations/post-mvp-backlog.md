# Post-MVP バックログ

**目的**: MVP 本番稼働後に着手する改善・整理項目の一元管理。致命度は低いが放置すると負債化する案件を記録する。

**運用**:
- 着手時は関連 PR 番号を記載し、完了したら該当項目を削除する
- 新規項目は「発見日: YYYY-MM-DD / 発見元セッション」を添える
- 優先度は 高 / 中 / 低 の 3 段階。高は 1 ヶ月以内、中は 3 ヶ月以内、低はいつでも

---

## 未解決バグ

### 🟢 低: 日誌 / つぶやき / ナレッジ作成モーダルの textarea を広げるとモーダルが閉じる
- **発見日**: 2026-05-21 / chimo 報告
- **現状**: 日誌・つぶやき・ナレッジの新規作成モーダル内の textarea (本文入力欄) の右下 resize handle をドラッグして広げると、モーダル本体が消えてしまう (書きかけ本文も失われる)
- **影響**: 長文を書きたいときに入力欄を広げる動作がそのまま離脱事故になる。ただし「広げない」で回避可能、頻度は低と推定
- **対策**: 未着手。再現確認 → 原因特定 (resize 中の pointer event がモーダル outside click 判定に拾われている可能性が一つの仮説、 要コード確認) → 修正

---

## 脆弱性対応 / 依存更新

### 🔴 高: Next.js 14 → 15 major upgrade + drizzle-orm 0.30 → 0.31+ upgrade
- **発見日**: 2026-04-22 (Phase C CI GREEN 化中に OSV-Scanner の CVE 一斉発覚)
- **期限**: 2026-06-30 (MVP ローンチから約 2 ヶ月)
- **背景**: Next.js 14.2 系の 5 CVE (High 2 + Medium 3) と drizzle-orm 0.30.10 の 1 High CVE が、それぞれ 14.2 最終 patch / 0.30 最終 patch で fix 対応していない。major upgrade (Next.js) / minor upgrade (drizzle-orm) が必要
- **2026-05-18 update**: GHSA DB の新規 publish で Next.js 14.2.35 系の CVE が **9 件追加検出** (合計でほぼ全方位の Next.js 脆弱性が surface)。 これらは個別 osv-scanner.toml への ignore 追加ではなく **Next.js 15 upgrade で一括解消** する方針。 期限 (2026-06-30) は据え置き、 upgrade 着手時に CVE 解消を verify する手順に組み込む:
  - `GHSA-c4j6-fc7j-m34r` (CVSS 8.6 High) ← 要 review
  - `GHSA-36qx-fr4f-26g5` (CVSS 7.5)
  - `GHSA-8h8q-6873-q5fj` (CVSS 7.5)
  - `GHSA-gx5p-jg67-6x7h` (CVSS 6.1)
  - `GHSA-h64f-5h5j-jqjh` (CVSS 5.9)
  - `GHSA-wfc6-r584-vfw7` (CVSS 5.4)
  - `GHSA-ffhc-5mcf-pf4q` (CVSS 4.7)
  - `GHSA-3g8h-86w9-wvmq` (CVSS 3.7)
  - `GHSA-vfv6-92ff-j949` (CVSS 3.7)
- **2026-05-19 update**: 上記 Next.js 9 CVE と同タイミングで **devDependency 経路の 2 CVE** が追加検出。 いずれも production runtime に混入しない (build/test time only) ため、 Next.js 9 CVE と同様に **個別 osv-scanner.toml への ignore 追加はせず**、 上位パッケージの upgrade で自然解消する方針。 期限 (2026-06-30) は据え置き:
  - `GHSA-jxxr-4gwj-5jf2` (brace-expansion 5.0.5, CVSS 6.5) — 依存経路: `minimatch@10.2.5` → `@typescript-eslint/typescript-estree@8.58.2` → `eslint-config-next@14.2.35` (devDependencies)。 Next.js 15 upgrade で eslint-config-next も追従するため自然解消の可能性高
  - `GHSA-58qx-3vcg-4xpx` (ws 8.20.0, CVSS 4.4) — 依存経路: `jsdom@24.1.3` → `vitest@1.6.1` / `@vitest/coverage-v8@1.6.1` (devDependencies)。 vitest 系の minor upgrade で解消可能、 Next.js 15 upgrade と独立して任意のタイミングで対応可
- **MVP β 期間の allowlist 根拠**:
  - vitanota は多層防御 (CloudFront secret 強制化 + WAF rate limit + 招待制 + RLS + session 8h) により実効リスクを中弱に抑制
  - SSRF は VPC Private Isolated で外部到達不能、Cache 系は CachingDisabled で影響ゼロ
  - drizzle SQL Injection は parameterized API のみ使用で実効リスク低
  - 詳細な CVE 別評価は `osv-scanner.toml` の各 reason 欄
- **upgrade 手順 (推定工数 2-4 日)**:
  1. Next.js 14 → 15 migration (React 19 含む、App Router / Middleware signature 変更追従)
  2. drizzle-orm 0.30 → 0.31+ migration (schema API 変更確認)
  3. 統合テスト + E2E regression 確認
  4. 2026-05-18 検出分の 9 CVE + 2026-05-19 検出の brace-expansion CVE が解消されたことを osv-scanner で verify (ws CVE は vitest upgrade を別途実施)
  5. 本番 deploy (CloudFront + App Runner)
- **運用監視**: 月次で OSV-Scanner 結果を review、新 CVE 発生 or severity 上方修正時は個別対応判断
- **CI 表示の扱い**: Dependency Audit ジョブは `continue-on-error: true` で workflow conclusion は success だが、 ジョブバッジは Next.js 9 CVE + devDeps 系 2 CVE (brace-expansion / ws) で red 表示が継続。 Next.js 15 upgrade + vitest upgrade まで許容

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

### 🔴 高: PAM failed 根本原因の確定 (2026-05-15 fix デプロイ後の検証)
- **発見日**: 2026-05-15 (PAM failed 再発、incident #6 解析で構造確定)
- **背景**: 5/9 で TTL 短縮で解消したと判断したのは不完全。2026-05-15 に「特定 token generation が RDS 側で 3-4 分間 blacklist される」別構造が判明。教員アクセス集中時に発火 (必要条件)。詳細は memory `project_pam_auth_real_structure_20260515`
- **当日対応**: `fix/2026-05-15-pam-retry-invalidate` で retry + compare-and-invalidate を実装、4 分障害 → ~50ms に短縮する症状対策。CloudWatch postgresql logs export を ON
- **やること**:
  1. 本番デプロイ後の次回 PAM failed event で CloudWatch logs を確認し、retry succeeded が正常に出ることを verify
  2. 次回再発で **postgres logs から reason code を取得**して根本原因仮説 (per-token throttling) を検証
  3. AWS Support に IAM auth per-token throttling 仕様を問い合わせ
  4. 根本原因確定後、症状対策で十分か (retry のみ) / 経路切替必要か (password auth + Secrets rotation / RDS Proxy) を再判断

### 🟡 中: PAM retry 関連の cleanup (本番デプロイ後の余裕で着手)
- **発見日**: 2026-05-15 (上記 retry 実装の副産物)
- **項目**:
  1. **pool sweep (Phase 2)**: 同一 generation で N 秒以内に M 回失敗 → idle clients destroy。最初の retry 実装では未着手 (reconnect storm 防止)。本番ログで retry_success が出続けても旧 generation の尾が長く残る場合に追加
  2. **`db.connect.retry.same_generation` assertion の unit test**: production code 改変 (UUID 注入可能化 or 専用 wrapper) なしには `vi.doMock('node:crypto')` が効かず unit test 困難 ([[feedback_vi_domock_node_builtin]])。production の assertion 行は CloudWatch で監視中
  3. **`RDS_PROXY_ENDPOINT` env 名 rename**: RDS Proxy 無いのに名前嘘 (`src/shared/lib/db.ts:90`、`src/shared/lib/db-auth.ts:33`)。`RDS_ENDPOINT` に rename。CDK 側との同期必要
  4. **`src/shared/lib/db.ts` / `db-auth.ts` のコメント嘘修正**: 「RDS Proxy がプール管理」「IAM トークン 15 分」「12 分 TTL キャッシュ」等の古い記述を実態 (Proxy 無し、TTL 8 分) に合わせる
  5. **AutoMinorVersionUpgrade 運用見直し**: 2026-05-15 当日に B+C ハイブリッド (AutoMinor: false + window 変更) を検討したが、PAM failed が AutoMinor 起因ではないと判明し見送り。再発が別パターンになったら再評価

### 🟢 低: CDK ドリフト解消 (CloudWatch Logs export ON を CDK に反映)
- **発見日**: 2026-05-15 (PAM 調査中の本番設定変更)
- **現状**: AWS CLI 直接 `modify-db-instance --cloudwatch-logs-export-configuration` で postgresql ログを ON。CDK 側 (`infra/lib/data-core-stack.ts` 想定) には反映していない
- **影響**: 次回 cdk deploy で drift が出る、もしくは ON が消える可能性
- **対策**: CDK の RDS instance 定義に `cloudwatchLogsExports: ['postgresql']` を追加

### 🟡 中: アクセス分布ダッシュボード Phase 2 項目
- **発見日**: 2026-05-15 (Phase 1 `/admin/access-distribution` 実装と並走)
- **現状**: `/admin/access-distribution` は PV (CloudWatch Metrics Requests) + UU (sessions テーブル) を時間帯別/日付×時間帯で可視化。全テナント集計、system_admin のみ
- **Phase 2 項目**:
  1. **PAM failed event overlay** — 時間帯バーに `vitanota-prod-pam-auth-failed` 件数を重ね表示。incident と利用集中時間帯の相関を一目で
  2. **tenant 別 breakdown** — 学校ごとの PV / UU。⚠️ memory `feedback_observed_moment_broken` 踏み絵 (「観測されてる感」を admin に出すかの判断必要)
  3. **1 分粒度集計** — incident 分析用。CloudWatch Metrics retention 15 日制約、UI も別画面化推奨
  4. **middleware page_view event** — 精度高い PV (route 単位の breakdown 可)。middleware.ts に 10 行追加 + CloudWatch Logs Insights クエリ
  5. **ヒートマップで UU** — 現在は PV のみ、UU は sessions 粒度の制約あり (last_accessed_at 更新間隔)
  6. **`APPRUNNER_SERVICE_NAME` / `APPRUNNER_SERVICE_ID` の env 化** — 現在 `src/features/access-distribution/lib/cloudwatchClient.ts` で `process.env.X ?? '本番 default'` フォールバック。CDK で AppRunner env に追加すれば test/prod 切り替え可能に
  7. **aggregator / API route / UI コンポーネントの test 強化** — Phase 1 MVP は aggregator unit test のみ。CloudWatch SDK mock (`@aws-sdk/client-mock`) で API route 統合テスト + RTL で UI 検証

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

### 🟢 低: `sessions.session_token_hash` カラム追加 (集計効率化)
- **発見日**: 2026-05-19 (middleware page_view 構造化ログ実装の設計議論中)
- **背景**: middleware page_view ログには session_token の sha256 hash prefix (16 char) のみ記録する設計を採用 (生 token を吐くと漏洩時にセッション乗っ取り可能になるため)。 集計時は sessions テーブル側で `encode(digest(session_token, 'sha256'), 'hex')` を都度計算して log の hash と join する
- **影響**: sessions テーブルが将来肥大化したとき、 集計クエリで毎回 digest 計算が走るためパフォーマンス劣化の可能性。 vitanota β 期間の規模 (数百〜数千行) なら誤差レベルだが、 学校導入数が増えてアクセス分析を頻繁に実行するようになると体感される可能性
- **対策**: sessions テーブルに `session_token_hash TEXT` カラムを追加、 NextAuth session 作成時 (DrizzleAdapter のフック or trigger) に pre-compute して埋める。 既存 row は migration で backfill。 集計クエリは digest 計算なしで直接 join 可能になる
- **判断材料**:
  - sessions テーブル row 数 (現状は 8h expire で自然減、 session cleanup backlog 未実装のため累積)
  - 集計クエリ頻度 (アクセス分析を 1 日 1 回程度なら不要、 リアルタイム BI ツール経由で多発するようになったら必要)
- **着手判断**: sessions テーブルが数万行 + 集計遅延を感じたとき、 もしくは BI ツール導入で集計頻度が大幅増加したとき
- **関連 backlog**: 「🟡 中: 期限切れ session の自動クリーンアップ」 (DB / 接続セクション、 sessions テーブル肥大化対策)

---

## CI / テスト

### 🔴 高: CI workflow が main で常時 fail (5/14 以降、 setup-node の pnpm × Node 不一致)

- **発見日**: 2026-05-15 (PAM retry / access-distribution 一連の作業中)
- **背景**: setup-node action 経由で pnpm を install する際、 最新版 pnpm が Node v22.13+ を要求するが CI runner は Node v20 を使用。`Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite` で setup-node が失敗 → 依存ジョブも全部 fail
- **影響ジョブ** (最新 run 25904201369 / sha 6d95a46、 main の **全** CI run が 5/14 以降 failure):
  - Lockfile Integrity (setup-node 段階で失敗)
  - Lint / Type Check / Test (同上)
  - Integration Tests (PostgreSQL) (同上)
  - E2E Tests (Playwright) (下記 既知項目 + setup-node 問題併発)
  - Dependency Audit (OSV-Scanner) (Next.js 14→15 backlog の既知 CVE allowlist、 これは別系統)
  - Secret Scan (gitleaks) のみ success
- **影響**: 回帰検出能力ゼロ。 何を変更しても何も気づかない状態
- **対策候補**:
  1. CI workflow を Node v22 にアップグレード (`.github/workflows/ci.yml` の `node-version`)
  2. pnpm version を Node v20 互換の特定バージョンに pin (setup-node の `version: latest` を `version: 9` 等に固定)
  3. setup-node + corepack で pnpm 管理を一元化
- **判断保留**: Node v22 upgrade は Next.js 14→15 と同時にやる方が干渉少ない可能性。 ただし「常時 fail で何を変更しても何も気づかない」状態は危険、 最低でも pnpm pin の hotfix を先行
- **着手判断**: 至急 hotfix (pnpm pin) を 1-2 時間で投入、 Node v22 upgrade は Next.js 15 と同時
- **関連**: Next.js 14→15 upgrade (脆弱性セクション)、 下記 E2E test 16 件

### 🟡 中: coverage threshold を元の水準 (lines/branches/statements 80, functions 70) に戻す
- **発見日**: 2026-05-04 (functions のみ)、 **2026-05-18 拡大** (4 項目すべて低下)
- **現状** (2026-05-18 PR #36): `vitest.config.ts` の coverage threshold を暫定的に下げた:
  - lines: 80 → **40** (CI 計測値 40.38)
  - statements: 80 → **40** (CI 計測値 40.38)
  - branches: 80 → **75** (CI 計測値 77.41)
  - functions: 70 → **55** (CI 計測値 56.43)
- **2026-05-18 拡大の原因**: 直近 PR #29 ほかで AI chat (ai-chat/* 7 file)・morning-plan (8 file)・onboarding (8 file)・admin-dashboard 系の UI component が大量追加されたが unit test 未整備。 これら全体が 0% coverage で全体平均を引きずり下げた
- **未カバー箇所** (主要):
  - **AI chat 系**: `src/features/ai-chat/components/*` (ManualTaskCreateForm / CaptureSection / TaskCreateTabs)、 `src/features/ai-chat/lib/*` (chatExtraction / piiMask / featureFlag)
  - **morning-plan 系**: `src/features/morning-plan/components/*` (8 file 全部)
  - **onboarding 系**: `src/features/onboarding/components/*` (Coachmark / Hint 7 file)
  - **2026-05-04 既知**: `src/features/tasks/lib/taskService.ts`、 各種 `errors.ts` の Error constructor 群
  - **2026-05-15 既知**: cloudwatchClient.ts / sessionUuRepository.ts / API route / UI components (access-distribution Phase 2 行き)
- **対策**: 各 feature の component / lib に unit test 追加 → 段階的に threshold を 80/70/80/80 (or それ以上) に戻す
- **暫定下げの注意**: lines/statements 40 は CI 値ぴったり (margin 0.38)、 test が 1 件減る or 0% file が増えると即 fail。 新 PR で UI 追加するときは同時に最低限の render test を入れる運用が望ましい
- **着手判断**: β ローンチ後の安定期、 coverage 厳守ポリシー復元

### 🟢 低: GitHub Actions の Node.js 20 actions を Node.js 24 対応版へ更新
- **発見日**: 2026-05-25 / 開発者ノート Widget 削除 deploy 中の workflow warning で検出
- **期限**: 2026-09-16 (Node.js 20 が GitHub Actions runner から削除される日付)。 2026-06-02 以降は強制的に Node.js 24 で実行される (= 互換性問題発生の可能性)
- **対象 actions** (deploy.yml で使用、 pinned SHA で固定中):
  - `actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11`
  - `aws-actions/amazon-ecr-login@062b18b96a7aff071d4dc91bc00c4c1a7945b076`
  - `aws-actions/configure-aws-credentials@010d0da01d0b5a38af31e9c3470dbfdabdecca3a`
- **対策**: 各 action の Node.js 24 対応版に bump (SHA pin は維持)。 ci.yml 側も同様に使われていないか同時確認
- **検証手順**: `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` を workflow env に一時設定して dry run で互換性検証 → OK なら SHA bump
- **緊急回避**: 万が一 Node.js 24 移行で死んだら `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true` で一時的に opt-out 可 (短期しのぎのみ、 2026-09-16 までに恒久対応)
- **着手判断**: Next.js 15 upgrade と独立、 ci.yml fix の延長で同時にやるのが筋

### 🟢 低: E2E test (Playwright) の継続的整備 (2026-05-18 ほぼ resolve)
- **発見日**: 2026-05-04 (fix/ci-green 着手中、ローカル実走 16 failed / 10 passed を確認)
- **2026-05-18 status**: dashboard 統合 ([[project_dashboard_structure_20260424]]) と migration 0016 (tags → emotion_tags) に追従して spec を全面 rewrite、 **25 passed + 1 skipped / 26 tests** でローカル / CI ともに green 化 (CI workflow の pnpm 11 死は PR #35 で並走解消)
- **resolved した内訳**:
  - **01-auth**: `/journal` → `/dashboard` URL 置換、 `journal-timeline-heading` testid → `dashboard-page` に追従
  - **02-journal-crud**: `/journal/new` 廃止 → `quick-record-tweet` pill → Modal の EntryForm 操作経路に rewrite。 編集/削除動線も entry-card menu → menu-edit/menu-delete → Modal に追従
  - **03-timeline**: `/journal` / `/journal/mine` → `/dashboard?tab=notes` + `timeline-subtab-personal` 子タブクリックに追従
  - **04-tags**: seed helper の createTag を `category` required + `type` field 削除に修正、 spec も Modal 経由の `tag-filter` 操作に rewrite
- **残された skip 1 件**: 04-tags の `感情タグと業務タグが視覚的に区別される` は migration 0016 で「業務タグ」概念が emotion_tags 側から廃止 (task_categories に移譲) されたため成立しない。 将来 task_categories 統合 tag-filter UI を作る場合に復活検討
- **継続的整備**:
  - 新規 UI 機能追加時に testid と spec の追従を運用ルール化
  - CI required check 設定の検討 (現状は continue-on-error なし、 fail で merge ブロック)

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

### 🟡 中: stale ドキュメントの順次統合
- **発見日**: 2026-04-21
- **現状**: `docs-index.md` で [LEGACY] タグを付けた docs が残っている
  - `construction/auth-externalization.md` (旧 Auth 設計)
  - `construction/migration-apprunner-to-ecs-express.md` (塩漬け)
- **対策**: 以下の順で整理
  1. auth-externalization.md → user-onboarding-flow.md に内容統合 (実装確定後)
  2. migration-apprunner-to-ecs-express.md → AppRunner 継続が確定したら削除 or 「検討経緯」として縮約
- **着手判断**: Auth 実装が 1 ヶ月以上安定稼働し、ECS 移行判断が固まったら
- **2026-05-29 完了済**: session-handoff-20260420.md は `operations/history/` に退避済 (docs cleanup PR)

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

### ⚪ 凍結: 既存 journal_entries の content_masked を batch backfill
- **凍結日**: 2026-05-15 (週次レポート機能撤回 2026-04-27 に伴い、 本項目も実質不要)
- **凍結理由**: 週次サマリ機能が「先週のvitanotaレポート 機能 (凍結)」で全面撤回されたため、 content_masked カラムを埋める backfill 自体が不要。 ただし将来 AI 機能再開時に同じ仕組みが復活する可能性があるため、 設計参照用として残置
- **元の内容** (2026-04-27 発見):
  - 週次レポート MVP で on-the-fly mask 採用、 新規投稿は API で content_masked 常時埋め
  - 既存投稿は backfill 必要 (TS script で全 entries に maskContent 適用)
  - 設計書: `construction/weekly-summary-design.md` § 9.3
- **再開時に必要**: 週次レポート機能を再設計するなら本項目も再評価

### 🟡 中: H3 リフレーミング (H3-A 見通し仮説 + H3-B 来訪価値仮説)

- **発見日**: 2026-05-20 (chimo の H3 再仮説ブレスト、 午前: 「今日の仕事を始める」 ボタンが押されない観察、 午後: 「機能」 ではなく「体験」 = 朝の入口体験 への深掘り)
- **背景**: H3 機能そのものではなく、 入口の儀式設計が教員の自然な行動とズレていた。 さらに H3 は本来「朝 vitanota を開く理由を作る」 体験設計だったと判明。 詳細: memory `project_h3_reframing_20260520` / `project_h3_morning_arrival_value`
- **Phase 構造**:
  - **Phase 1 (朝カード)** = H3-B「朝の来訪価値仮説」、 教員が朝開いた瞬間に「来てよかった」 と感じる体験。 chat より優先。 [[project_h3_morning_arrival_value]] 設計参照
  - **Phase 2 (chat 統合)** = H3-A「見通し仮説」、 chat に「今日やること教えて」 と書ける動線。 chat-habit-strategy の延長
  - **Phase 3 (昼カード / 夕カード)** = 時間帯別の体験、 H3-B 派生
- **Phase 1 実装スコープ** (朝カード):
  - 新規 API `/api/dashboard/morning-card` (GET): 自分が assignee の未完了から優先度順 top 3、 昨日の完了数、 表示可否 (時間帯 + dismiss)
  - 新規 API `/api/dashboard/morning-card-dismiss` (POST): `onboarding_states` に dismiss row を INSERT
  - 新規 component `MorningGreetingCard`: 挨拶 / 昨日完了数 / 候補 3 件 / 解放メッセージ / 閉じるボタン
  - dashboard 統合: メイン領域上部に配置
  - 表示時間帯: 朝 4-11 時 JST
  - dismiss: 1 日 1 回 (onboarding_states 流用)
  - AI 不使用、 ルールベース
- **Phase 2 実装スコープ** (chat 統合、 Phase 1 リリース + 観察期間後に着手):
  - `pages/api/ai-chat/extract.ts` に意図判定 regex 追加 (「今日やること教えて」 系)
  - `pages/api/ai-chat/morning-plan.ts` の `handleStart` 廃止、 `handleGenerate` を export 化
  - Lambda + Next.js の capacity 廃止 (今日午前に実装したが revert 済、 再実装)
  - 既存 UI (CapacityModal / MorningPlanCard / MorningPlanSection / PlanResultModal / 4 hint) 削除
  - 分析指標差し替え (capacity 系削除 + quickEditWithin30m 追加)
  - Phase 1 ブランチ作業中の commit ログ (旧 feature/2026-05-20-h3-reframing) を参照可能
- **Phase 3 実装スコープ** (昼/夕カード、 Phase 1/2 安定後):
  - 昼カード (11-15 時 JST): 午前の完了数 + 午後の候補 1-2 件 + 「ここまでで十分」 メッセージ
  - 夕カード (15-21 時 JST): 今日の完了数 + 明日期限のタスク + 「今日はここまで」 (時間軸の区切り、 評価せず)
  - 「お疲れさま」 系の感情代弁は禁止 ([[feedback_ai_output_guards]])
- **既存実装への影響 (軽い)**:
  - morning_plan Lambda + today_plan_v1 prompt: そのまま流用 (Phase 2 で使用)
  - today_plan_items schema: Phase 2 で acceptedAt / startedAt の段階廃止、 破壊的変更なし
  - データモデルはほぼ流用、 UI と入口だけリフレーミング
- **踏み絵チェック**:
  - 「確定」 強要は vitanota を承認者ポジションに立たせる、 廃止 (`feedback_observed_moment_broken` の輪郭)
  - chat 入口統合は `project_chat_habit_strategy` の最初の検証台 (Phase 2 で実装)
  - 教員の「押し付けられ感がない」 を数値化せず qualitative に残す (数値化した瞬間に踏み絵)
  - 朝カードは AI 不使用、 ルールベース (AI 判断を排除して観測感を出さない)
  - 朝カード文言: 「お疲れさま」 「がんばってます」 等の感情代弁禁止
- **指標** (Phase 1):
  - 朝の再訪率 (過去 7 日のうち朝アクセス日数 / 7)
  - 朝カード後のタスク操作率 (30 分以内の status / due_date 変更 or 新規作成)
  - 翌朝再来訪率
  - 朝カード dismiss vs 放置率 (放置 = 邪魔ではない signal)
- **関連 memory**: `project_h3_reframing_20260520` / `project_h3_morning_arrival_value` / `project_chat_habit_strategy` / `project_morning_plan_h3` / `feedback_observed_moment_broken` / `feedback_design_vocab` / `feedback_ai_output_guards`

---

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

### 🟡 中: AI prompt 改善のためのデータ取得拡張 (Step 1 棚卸し)

- **発見日**: 2026-05-20 (chimo の「データから AI に再学習させたい」議論の棚卸し調査)
- **背景**: prompt を磨くには「AI 提案 vs 教員確定」の差分データが必要。棚卸し調査で `ai_sessions.userConfirmed` (titleChanged / categoryChanged / dueDateChanged) と morning_plan の `ai_bucket` vs `final_bucket` は既に取れていることを確認。一方で以下 4 件の取得ギャップがあり、これを埋めないと「/admin/ai-improvement ダッシュボード (Step 2)」と「AI 整理 Phase C-E」の橋渡しが片手落ちになる
- **取得ギャップ 4 件**:
  1. **model_id を `ai_output_json` に記録** — Bedrock invoke payload 拡張で `model='claude-sonnet-4-6'` 等を payload に含めて保存。Sonnet / Haiku の精度比較が可能になる
  2. **AI タグ提案を実装** — `LambdaResponseSchema` に `suggestedTagNames: string[]` を追加 (category_id 同様に名前で返す)。`ai_output_json.aiSuggestedTags` 保存 + confirm 時に `adoptedTagIds` 差分を `userConfirmed` に追記。タグ採用率を集計可能に
  3. **morning_plan 見送り理由** — Lambda が `not_shown_task_ids` に `reason` / `confidence` を付与して返す。`ai_output_json.plan.not_shown_tasks` に保存。「なぜこのタスクは朝プランから外れたか」を集計可能に
  4. **教員編集後の最終 text を `ai_sessions` に永続化** — 現状 confirmed 後は tasks / journal 側に流れて `ai_sessions` には残らない (`userConfirmed` の field 単位差分のみ)。`confirmed_final_values JSONB` カラム追加で AI 提案 → 教員編集 → 最終確定の 3 段階を追跡可能に
- **着手順序の推奨**: 1 (model_id) → 4 (final values) → 3 (morning_plan reason) → 2 (タグ提案)。1 と 4 は schema / payload 拡張のみで軽い、2 と 3 は Lambda 側 prompt 拡張を伴う
- **裏テーマ踏み絵チェック**: 全項目セーフ
  - model_id / prompt version / 見送り理由は system 側メタデータ (教員観測ではない)
  - 業務タグ提案は `feedback_work_tag_not_observed` で OK
  - final text は `ai_sessions` の RLS が「本人 + system_admin のみ」で school_admin 不可視 (`project_ai_sessions_visibility`)
  - mood には触れない (`feedback_mood_ai_untouchable`)
- **依存 / 関連 backlog**:
  - 前提: なし (即着手可)
  - 後続: 「/admin/ai-improvement ダッシュボード」(Step 2、本項目完了後に着手)
  - 並行可: 「AI 整理 Phase C-E」C4 (プロンプトバージョン DB 化) — 独立に進められる
- **関連 memory**: `project_ai_sessions_visibility` / `project_morning_plan_h3` / `project_tag_to_category_strategy_20260515` / `feedback_work_tag_not_observed`

### 🟢 低: /admin/ai-improvement ダッシュボード (Step 2)

- **発見日**: 2026-05-20 (同セッション)
- **着手条件**: 上記「AI prompt 改善のためのデータ取得拡張」完了 + ai_sessions に最低 2 週間分のデータ蓄積
- **背景**: system_admin が「AI 提案 vs 教員確定」の差分パターンを見て prompt 改善を判断するための画面。Step 1 のデータ取得拡張が前提
- **画面要件 (案)**:
  - セッション一覧 (匿名化済み、テナント横断): 元投稿 → AI 出力 → 教員確定 の 3 段表示
  - 差分の頻出パターン (「AI がよく外す箇所」)
  - タグ提案の採用率 / 拒否率
  - morning_plan の編集パターン (削除多い? 並べ替え多い?)
  - model 別 / prompt version 別の精度比較
- **API**: `/api/system/ai-improvement/*` (`feedback_system_admin_no_tenant` パターン)
- **裏テーマ踏み絵チェック**:
  - 教員名 / メアド / mood は絶対出さない (`feedback_observed_moment_broken` / `feedback_mood_ai_untouchable`)
  - 画面内文言で「AI が学習しています」「教員の投稿で AI が改善」は使わない (観測感 NG)
  - 集計は完全に匿名化、個人特定可能な状態で表示しない
- **関連 memory**: `feedback_system_admin_no_tenant` / `project_ai_sessions_visibility` / `feedback_observed_moment_broken`

### 📝 記録: AI 機能フラグ default の経緯 (`aiChatEnableExtraction`)

- **記録日**: 2026-05-17
- **現状**: `infra/bin/vitanota.ts` の `aiChatEnableExtraction` の fallback default を **prod 環境のときだけ `'true'`** に固定 (それ以外の環境では `'false'`)
- **経緯**:
  1. 2026-05-14: context 未指定の `cdk deploy vitanota-prod-app` が本番 AppRunner env を default `'false'` に上書きして AI 機能を全テナント停止する事故が発生 (memory `feedback_cdk_app_stack_context_required`)
  2. 2026-05-17: db-migrator Lambda 更新で再度同じ罠を踏みそうになり、context 明示 (`-c aiChatEnableExtraction=true`) で回避
  3. 同日: 「次回も忘れる前提」で fallback default を prod=true / その他=false に変更 (本 commit)
- **AI 機能を本番で全 OFF にしたいとき (= 障害 / 一時停止 / コスト超過 等)**:
  - **A. CDK deploy で明示**: `pnpm cdk deploy vitanota-prod-app -c aiChatEnableExtraction=false`
  - **B. ソース変更**: `infra/bin/vitanota.ts` の prod 分岐を `'false'` にしてデプロイ
  - どちらも本番 AppRunner サービスの env が `ENABLE_AI_CHAT_EXTRACTION=false` に上書きされ、即時に全テナント OFF
- **特定テナントだけ ON にしたいとき**: `AI_CHAT_ALLOWLIST_TENANT_IDS` を CSV 文字列で指定 (`-c aiChatAllowlistTenantIds=uuid1,uuid2`)。現在は空 (全テナント ON)。allowlist 運用に切り替えるなら chmo 判断
- **関連**: memory `feedback_cdk_app_stack_context_required` / `project_ai_chat_feature_flag`

---

### 🟡 中: AI チャット機能の有効化フラグの管理画面化
- **発見日**: 2026-05-13
- **現状**: `ENABLE_AI_CHAT_EXTRACTION` + `AI_CHAT_ALLOWLIST_TENANT_IDS` の 2 段 env で制御 (AppRunner 環境変数)。テナント追加のたびに CSV 文字列を更新 + AppRunner 再起動 (~3 分)。緊急停止は `ENABLE_AI_CHAT_EXTRACTION=false` で全テナント即時 OFF
- **影響**: テナント追加に deploy 権限と AppRunner 再起動が必要。校長動線で対応校が増えると運用負荷が線形に増える
- **対策**: system_admin 専用画面 (例: `/admin/feature-flags`) で DB ベースのフラグ管理に移行。`feature_flags` テーブル + `feature_flag_tenants` 関連テーブル + RLS。即時反映、deploy 不要
- **着手判断**: allowlist 対象テナントが 10 件超えた時点、または「申請から 3 営業日以内に AI 機能 ON」要求が校長動線で出た時点で優先度を上げる。それまで env 運用で十分
- **裏テーマ踏み絵**: 「機能 ON/OFF」自体は運用情報 (踏み絵ではない)。ただし「AI 利用量」「ON 履歴」を school_admin 閲覧可能にしない (= 観測者原則の対象)。管理画面は system_admin 専用とし RLS 設計を踏襲
- **関連 memory**: `project_ai_chat_feature_flag.md`

### ✅ 実装済: フィードバック返信機能 (F3)

- **発見日**: 2026-05-16 (`feature/2026-05-16-ai-capture-onboarding` ブランチでスコープ外として切り出し)
- **実装日**: 2026-05-17 (`feature/2026-05-17-feedback-reply` ブランチ、migration 0042)
- **実装スコープ** (MVP):
  - 片方向スレッド (system_admin の複数返信 / 教員 read-only)
  - 返信者表記は一律「運営より」固定 (個人名を出さない、`feedback_design_vocab`)
  - 内部 status enum は **持たない** (本文に「今回は見送り」「別のかたちで検討中」等を書く運用)
  - 教員側 FAB に未読 dot のみ (件数表示なし)、FAB モーダル accordion から read-only 表示
  - school_admin 完全不可視 (admin 画面・admin API は system_admin のみ、`feedback_observed_moment_broken`)
- **スコープ外** (将来検討): 返信の編集/削除、AI 返信下書き、通知 push/メール、教員からの返信
- **言葉遣いの注意 (踏み絵)**: 内部 enum で `declined` を使う場合でも、教員に見える日本語文言は「却下」「拒否」を避け、「今回は見送り」「別のかたちで検討中」等にする (`feedback_design_vocab`)。
- **裏テーマ踏み絵**: 運営→教員方向の返信は「届いてる感」で OK。ただし返信頻度・件数を school_admin 集計に出すと「教員ごとの不満度」可視化に滑るので避ける (`feedback_observed_moment_broken`)。school_admin 集計 endpoint は **意図的に作らない**。

### 🟢 低: AI 整理コーチマーク再表示動線

- **発見日**: 2026-05-16 (同上ブランチ実装中に派生)
- **背景**: 初回コーチマークを「閉じる」とその後 dismiss 永続化されて二度と出ない設計 (押し付け感排除)。文言改訂時 / 別端末で初めて触ったとき / 一度閉じた後にやっぱり見たいとき の再表示動線がない
- **検討案**:
  - ヘルプメニューに「使い方ガイド」項目を追加し、押すと state を reset して再表示
  - `aiCaptureOnboardingStateSchema.version` 不一致時に再表示する選択肢もあるが、現状の useOnboardingState は version を見ない実装
- **着手判断**: 「再表示したい」要望が現場から出たら優先度上げ。いきなり機能追加すると「閉じても出る」感が再生するので慎重に
- **凍結日**: 2026-05-15 (週次レポート機能撤回 2026-04-27 に伴い、 本項目も実質不要)
- **凍結理由**: 週次サマリ機能が「先週のvitanotaレポート 機能 (凍結)」で全面撤回されたため、 cron 自動生成も不要。 ただし将来 AI 機能再開時に類似の batch 設計が必要になる可能性があるため、 設計参照用として残置
- **元の内容** (2026-04-27 発見):
  - MVP では「アクセス時自動生成」、 月曜 fresh は保証されない
  - 対策: EventBridge Scheduler + Lambda で月曜 0:00 JST に batch 生成
  - 設計書: `construction/weekly-summary-design.md` § 17 (Phase 2)
- **再開時に必要**: 週次レポート機能を再設計するなら本項目も再評価

### 🟡 中: 「マイノート」 大タブ廃止に伴う E2E test 回帰修正

- **発見日**: 2026-05-21 (H3-B 朝カード v1 リリース後 CI で検出)
- **背景**: 2026-05-20 commit `fe61ac5` で dashboard 大タブ「マイノート」 を削除し、 右レーン
  (`PublicTimelineRail`) の「マイノート」 タブに統合した。 これに伴い以下の E2E spec
  7 件が古い構造 (大タブ「マイノート」 経由) を前提にして失敗
  - `__tests__/e2e/02-journal-crud.spec.ts`: 4 件 (US-T-010 新規投稿 / 非公開トグル、 US-T-011 編集、 US-T-012 削除)
  - `__tests__/e2e/03-timeline.spec.ts`: 2 件 (US-T-014 別テナント不可視、 マイノート全エントリ表示)
  - `__tests__/e2e/04-tags.spec.ts`: 1 件 (US-T-013 / US-T-021 タグ選択投稿)
- **影響**: 本番アプリの動作には影響なし (= AppRunner image に test は含まれず deploy 自体は success)。
  ただし journal 系の回帰検知が失われたまま
- **対応**: 各 spec を右レーン「マイノート」 タブ + `[data-testid="public-timeline-rail-tab-mine"]`
  クリック → エントリ確認の構造に書き換える
- **着手判断**: 次に journal 系の機能変更を行う際に併せて修正

### 🟢 低: OSV-Scanner CVE filter 拡張 (next 14.2.35 新規 CVE 群 + brace-expansion + ws)

- **発見日**: 2026-05-21 (本番 deploy 後 CI で検出)
- **背景**: `osv-scanner.toml` に既存の next 14.2 系 CVE filter があるが、 以下の新規 CVE が
  filter 漏れで CI failure
  - next 14.2.35: GHSA-36qx-fr4f-26g5 / -3g8h-86w9-wvmq / -8h8q-6873-q5fj / -c4j6-fc7j-m34r /
    -ffhc-5mcf-pf4q / -gx5p-jg67-6x7h / -h64f-5h5j-jqjh / -vfv6-92ff-j949 / -wfc6-r584-vfw7 (9 件)
  - brace-expansion 5.0.5: GHSA-jxxr-4gwj-5jf2
  - ws 8.20.0: GHSA-58qx-3vcg-4xpx
- **影響**: production runtime に直接の脆弱性影響なし (= 既存 filter と同じ判定理由が当てはまる)。
  Next.js 14.2 系継続課題の延長で、 2026-06-30 の Next.js 15 upgrade で解消予定
- **対応**: 各 CVE を `osv-scanner.toml` で評価 + filter 追加
- **着手判断**: 次の依存更新 / セキュリティ review 時に併せて

---

## 関連リファレンス

- 招待フロー仕様: `aidlc-docs/construction/user-onboarding-flow.md`
- 認証外部化設計: `aidlc-docs/construction/auth-externalization.md`
- セッション引き継ぎスナップショット: `aidlc-docs/operations/history/session-handoff-20260420.md`
- デプロイフェーズ: `aidlc-docs/construction/deployment-phases.md`
- インフラ監査: `aidlc-docs/operations/infrastructure-audit-20260419.md`
- ECS 移行計画: `aidlc-docs/construction/migration-apprunner-to-ecs-express.md`
- Code Review ロールアウト: `aidlc-docs/operations/claude-code-review-rollout.md`
- ユーザーライフサイクル仕様: `aidlc-docs/construction/user-lifecycle-spec.md`
- 運用リスク台帳: `aidlc-docs/construction/unit-02/nfr-design/operational-risks.md`
