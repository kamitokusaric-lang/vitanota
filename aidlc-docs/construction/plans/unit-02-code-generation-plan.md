# Unit-02 コード生成プラン

## ユニット情報
- **ユニット名**: unit-02（日誌・感情記録コア）
- **ワークスペースルート**: `/Users/chimo/vitanota`
- **プロジェクト構造**: Next.js 14 Pages Router、単一モノリス、`src/features/`・`src/shared/`・`pages/api/` 配下
- **依存ユニット**: Unit-01（認証・テナント基盤・withTenant HOF・Auth.js database セッション）
- **対象ストーリー**:
  - US-T-010: 日誌エントリを作成する
  - US-T-011: 日誌エントリを編集する
  - US-T-012: 日誌エントリを削除する
  - US-T-013: エントリにタグを付ける
  - US-T-014: タイムラインで日誌を閲覧する
  - US-T-020: 感情スコアを記録する（感情カテゴリ選択で代替）
  - US-T-021: 感情カテゴリを選択する
  - US-T-022: 感情データを後から修正する

## 前提と依存
- Unit-01 が既に実装済み（`src/shared/lib/db.ts`・`db-auth.ts`・`logger.ts`・`secrets.ts`・`rate-limit.ts`、Auth.js、withTenant ミドルウェア）
- Unit-01 スキーマ（`src/db/schema.ts`）に `tenants`・`users`・`accounts`・`sessions` 等を定義済み
- 既存マイグレーション: `migrations/0001_unit01_initial.sql`

## ユニット遡及更新（Unit-01 への追加）
Unit-02 NFR/インフラ設計で Unit-01 に追加した項目を反映する必要がある：
- **Auth.js セッション戦略を database に変更**（既存 JWT 戦略からの切替、Unit-01 に遡及）
- `sessions` テーブル追加（Auth.js drizzle アダプタ経由）
- `journal_entries` / `tags` に `(id, tenant_id)` UNIQUE 制約追加（複合FK対応）

## 実行ステップ

---

### Step 1: ディレクトリ準備とドメインスキーマ定義
- [x] `src/features/journal/` 配下に `lib/`・`components/`・`schemas/` サブディレクトリ作成
- [x] `src/db/schema.ts` に Unit-02 スキーマ追加
  - `journalEntries` テーブル（tenant_id / user_id / content / is_public / timestamps）
  - `tags` テーブル（tenant_id / name / is_emotion / is_system_default / sort_order / created_by）
  - `journalEntryTags` 中間テーブル（tenant_id 冗長 + 複合 FK）
  - `publicJournalEntries` view 定義（Drizzle pgView）
  - `sessions` / `verificationTokens` テーブル（Auth.js database 戦略）
  - 親テーブルに `(id, tenant_id)` UNIQUE 制約追加
- [x] 必要な型エクスポート（`PublicJournalEntry` 型ブランド含む）
- [x] `src/shared/lib/db.ts` に `withTenantUser` ヘルパー追加（tenant_id + user_id 両方設定）

**対応ストーリー**: 全 Unit-02 ストーリーの土台

---

### Step 2: データベースマイグレーション作成
- [x] `migrations/0002_unit02_sessions.sql` - Auth.js database 戦略用 sessions + verification_tokens（Unit-01 遡及）
- [x] `migrations/0003_unit02_journal_core.sql` - journal_entries / tags / journal_entry_tags テーブル作成 + インデックス + **複合 UNIQUE と複合 FK を初期作成に統合**
- [x] `migrations/0004_unit02_journal_rls.sql` - RLS ポリシー有効化（SP-U02-02 2ポリシー + tags + journal_entry_tags）
- [x] `migrations/0005_unit02_public_view.sql` - `public_journal_entries` VIEW + security_barrier（SP-U02-04 Layer 4）
- [x] ~~0006_cross_tenant_fk.sql~~ - 0003 に統合済み（初回 CREATE TABLE で複合 FK を定義する方がクリーン）

**対応ストーリー**: US-T-010〜014・020〜022 の DB 基盤

---

### Step 3: Zod スキーマ（lib/schemas/）
- [x] `src/features/journal/schemas/journal.ts`
  - `createEntrySchema`（content 1〜200・tagIds 最大10・isPublic）
  - `updateEntrySchema`（部分更新）
  - `timelineQuerySchema`（page・perPage）
  - 型エクスポート `CreateEntryInput` / `UpdateEntryInput`
- [x] `src/features/journal/schemas/tag.ts`
  - `createTagSchema`（name 必須・isEmotion）
  - `tagIdParamSchema`
- [x] クライアント・サーバー共通の前提

### Step 3.5: Zod スキーマテスト（Step 14 から前倒し）
- [x] `__tests__/unit/schemas/journal.test.ts` - 23 tests（正常系・境界値・異常系・部分更新・coerce）
- [x] `__tests__/unit/schemas/tag.test.ts` - 14 tests（createTagSchema・tagIdParamSchema）
- [x] `pnpm vitest run` で 37 テスト全 GREEN 確認

**対応ストーリー**: バリデーション層（SP-U02-01 二層バリデーション）

---

### Step 4: Repository 層実装（型分離）
- [x] `src/features/journal/lib/publicTimelineRepository.ts`
  - `findTimeline(tx, opts)` + `countTimeline(tx)` のみ実装、他メソッドなし
  - `publicJournalEntries` VIEW を SELECT
  - 型ブランド `PublicJournalEntry` を返却
- [x] `src/features/journal/lib/privateJournalRepository.ts`
  - `create` / `update` / `delete` / `findById` / `findMine` を実装
  - 所有者チェックを API 層の明示 WHERE 句（user_id + tenant_id）で二重化
- [x] `src/features/journal/lib/tagRepository.ts`
  - `seedSystemDefaults` / `create` / `delete` / `findAllByTenant` / `findValidTagIds`
  - SYSTEM_DEFAULT_TAGS 8件の定数定義
- [x] 型ブランド定義 `src/shared/types/brand.ts`（Step 1 で実施済み）
- [x] `pnpm tsc --noEmit` で型チェック GREEN 確認

### Step 4.5: Repository 層ユニットテスト（Step 12 から前倒し）
- [x] `__tests__/unit/publicTimelineRepository.test.ts` - 5 tests（findTimeline・countTimeline・is_public 列非露出）
- [x] `__tests__/unit/privateJournalRepository.test.ts` - 11 tests（create with/without tags・update・delete・findById・findMine）
- [x] `__tests__/unit/tagRepository.test.ts` - 12 tests（SYSTEM_DEFAULT_TAGS 4・seed 2・create・delete・findAllByTenant・findValidTagIds 2）
- [x] `pnpm vitest run` 全86 テスト GREEN（Unit-01 既存 + Unit-02 追加）

**対応ストーリー**: US-T-010〜014 の DB アクセス層

---

### Step 5: Service 層実装
- [x] `src/features/journal/lib/errors.ts` - カスタムエラー定義
- [x] `src/features/journal/lib/journalEntryService.ts`
  - `createEntry`・`updateEntry`・`deleteEntry`・`getEntryById`・`listMine` - トランザクション境界管理
  - タグ ID のテナント整合性検証（InvalidTagReferenceError）
  - 所有者検証 + RLS 二重防御
  - pino イベントログ出力（created/updated/deleted/read/list_read）
- [x] `src/features/journal/lib/tagService.ts`
  - `createTag`・`deleteTag`・`listTenantTags`
  - school_admin 権限チェック（ForbiddenError）
- [x] `src/shared/lib/logger.ts` に content/sessionToken redact 追加（P1-D対応）

### Step 5.5: Service 層ユニットテスト（Step 13 から前倒し）
- [x] `__tests__/unit/journalEntryService.test.ts` - 11 tests（vi.hoisted パターン）
- [x] `__tests__/unit/tagService.test.ts` - 6 tests
- [x] `pnpm vitest run` 全103 テスト GREEN

**対応ストーリー**: US-T-010/011/012/013

---

### Step 6: API Route 層 - /api/public/
- [x] `src/features/journal/lib/apiHelpers.ts` - 共通認証・エラーマッピングヘルパー
- [x] `pages/api/public/journal/entries.ts` - GET 共有タイムライン
  - `requireAuth` で 401/403/423 判定
  - `withTenantUser` で RLS セッション変数注入
  - `Cache-Control: public, s-maxage=30, stale-while-revalidate=60` ヘッダー
  - `PublicTimelineRepository.findTimeline` のみ使用
  - pino で `journal_entry_list_read` ログ出力

**対応ストーリー**: US-T-014

---

### Step 7: API Route 層 - /api/private/
- [x] `pages/api/private/journal/entries.ts` - POST 作成
- [x] `pages/api/private/journal/entries/[id].ts` - GET/PUT/DELETE
- [x] `pages/api/private/journal/entries/mine.ts` - GET マイ記録
- [x] `pages/api/private/journal/tags.ts` - GET 一覧・POST 作成
- [x] `pages/api/private/journal/tags/[id].ts` - DELETE
- [x] 全エンドポイントで `Cache-Control: private, no-store`
- [x] Zod バリデーション・requireAuth・mapErrorToResponse を統一パターンで使用

**対応ストーリー**: US-T-010/011/012/013/020〜022

---

### Step 8: Auth.js 設定更新（Unit-01 遡及）
- [x] `@auth/drizzle-adapter` v1.11.2 を導入
- [x] `src/features/auth/lib/auth-options.ts` を database 戦略に書き換え
  - strategy: 'jwt' → 'database'
  - DrizzleAdapter で users / accounts / sessions / verification_tokens を管理
  - 絶対最大寿命 8時間 (maxAge: 28800)
  - last_accessed_at 更新間隔 5分 (updateAge: 300)
  - jwt callback を削除し、session callback でテナント情報を解決
  - signIn callback (BR-AUTH-01 招待なし登録禁止) は維持
  - 型キャスト: drizzle-orm v0.30 と @auth/drizzle-adapter v1.11 の column 型差を吸収
- [x] events.signIn / events.signOut で session_created / session_revoked ログ出力
- [x] log-events.ts の SessionCreated / SessionRevoked を活用
- 注: アイドルタイムアウト 30分の厳密実装は middleware 層で後続実装（現状は updateAge 5分 + maxAge 8h で代替）
- 注: 強制ログアウト API（管理画面）・ロール変更時の自動失効・テナント停止時の自動失効は Unit-04 で実装予定（admin 機能）
- 検証: 142 tests still passing / pnpm tsc --noEmit GREEN

**対応ストーリー**: 論点 C 対応（JWT 失効不可解消）

---

### Step 9: Unit-01 Tenant 作成フローへのシード追加
- [x] `pages/api/system/tenants.ts` に `tagRepo.seedSystemDefaults` 呼び出しを追加
- [x] テナント作成と同一トランザクション内で 8件のデフォルトタグを INSERT（db.transaction）
- [x] RLS セッション変数（app.tenant_id / app.user_id）を SET LOCAL で注入
- [x] レスポンスに seededTagCount を含める
- [x] integration-test-plan.md に Suite 7a（Tenant 作成時シード検証）を追加
- [x] NFR-U02-03 対応

**対応ストーリー**: US-T-021 の土台

---

### Step 10: Frontend Components
- [x] `pnpm add react-hook-form @hookform/resolvers swr` 依存追加
- [x] `src/features/journal/components/TagFilter.tsx` - PP-U02-01 useMemo + includes、最大10件制御
- [x] `src/features/journal/components/EntryCard.tsx` - エントリ1件表示、privacy バッジ・編集リンク
- [x] `src/features/journal/components/EntryForm.tsx` - 作成・編集フォーム、React Hook Form + zodResolver、200文字カウンター
- [x] `src/features/journal/components/TimelineList.tsx` - SWR による共有タイムライン表示
- [x] `src/features/journal/components/MyJournalList.tsx` - マイ記録表示
- [x] `pages/journal/index.tsx` - タイムラインページ
- [x] `pages/journal/mine.tsx` - マイ記録ページ
- [x] `pages/journal/new.tsx` - 新規作成ページ（SWR mutate でキャッシュ無効化）
- [x] `pages/journal/[id]/edit.tsx` - 編集ページ（DELETE 機能含む）
- [x] `pages/dashboard/teacher.tsx` - /journal にリダイレクトするように更新
- [x] 全コンポーネントに data-testid 属性付与

### Step 10.5: Frontend ユニットテスト（Step 15 から前倒し）
- [x] `__tests__/unit/TagFilter.test.tsx` - 10 tests（ソート・フィルタ・10件上限・選択トグル）
- [x] `__tests__/unit/EntryCard.test.tsx` - 10 tests（50文字省略・privacy バッジ・編集リンク・タグ表示）
- [x] `__tests__/unit/EntryForm.test.tsx` - 8 tests（create/edit モード・バリデーション・fetch モック・PUT 検証）
- [x] `__tests__/unit/TimelineList.test.tsx` - 4 tests（取得・空・エラー・ページネーション URL）
- [x] `pnpm vitest run` 全142 テスト GREEN（Frontend 32 件追加）

**対応ストーリー**: US-T-010/011/014

---

### Step 11: ログイベント定義
- [x] `src/shared/lib/log-events.ts` 新規作成 - 型安全な中央定義
  - `LogEvents` 定数（14 イベント：Journal 5 + Tag 3 + Warning 3 + Session 3）
  - `LogEventPayloads` インターフェース（各イベントのペイロード型）
  - `logEvent<K>()` / `logWarnEvent<K>()` 型安全なヘルパー
- [x] Service 層・API Route 層を log-events 経由に移行
  - `journalEntryService.ts`: 5 イベント + 1 警告
  - `tagService.ts`: 3 イベント + 1 警告
  - `pages/api/public/journal/entries.ts`: 1 イベント
- [x] `src/shared/lib/logger.ts` に redact 追加（content/sessionToken、P1-D 対応）※ Step 5 で実施済み
- [x] `__tests__/unit/log-events.test.ts` - 7 tests（定数・logEvent・logWarnEvent）
- [x] `pnpm vitest run` 全110 テスト GREEN

**対応ストーリー**: 論点 D 対応（監査ログ）

---

### Step 12: ユニットテスト - Repository 層
- [ ] `__tests__/unit/publicTimelineRepository.test.ts`
- [ ] `__tests__/unit/privateJournalRepository.test.ts`
- [ ] `__tests__/unit/tagRepository.test.ts`
- [ ] モックは最小限、Drizzle のクエリ構築を検証

---

### Step 13: ユニットテスト - Service 層
- [ ] `__tests__/unit/journalEntryService.test.ts`
- [ ] `__tests__/unit/tagService.test.ts`
- [ ] ビジネスロジックの分岐を網羅

---

### Step 14: ユニットテスト - Zod スキーマ
- [ ] `__tests__/unit/schemas/journal.test.ts` - バリデーション境界値テスト

---

### Step 15: ユニットテスト - Frontend
- [ ] `__tests__/unit/EntryForm.test.tsx`
- [ ] `__tests__/unit/TagFilter.test.tsx`
- [ ] `__tests__/unit/TimelineList.test.tsx`
- [ ] React Testing Library + vitest

---

### Step 16a: 統合テスト基盤と Suite 1-2（integration-test-plan.md 準拠）
- [x] `__tests__/integration/helpers/testDb.ts` - DATABASE_URL 経由で接続・migration 適用 (CI services postgres)
- [x] `__tests__/integration/helpers/seed.ts` - tenant/user/entry/tag シードヘルパー
- [x] `__tests__/integration/tenant-isolation.test.ts` - Suite 1 (Baseline) + Suite 2 (Cross-tenant + 複合 FK)
- [x] `vitest.integration.config.ts` 新規作成（直列実行・60s timeout）
- [x] `vitest.config.ts` から integration ディレクトリを exclude
- [x] `package.json` に `test:integration` スクリプト追加
- [x] `.github/workflows/ci.yml` に integration-test ジョブ追加
  - GitHub Actions services: postgres:16-alpine
  - DATABASE_URL を環境変数で渡す
  - pg_isready で待機
- [x] testcontainers 依存は不要のため削除（CI でのみ実行する方針）
- [ ] Suite 3 (Session leakage) - 後続バッチで実装
- [ ] Suite 4 (RLS fail-safe) - 後続バッチ
- [ ] Suite 5 (is_public leak prevention) - 後続バッチ
- [ ] Suite 6 (IDOR prevention) - 後続バッチ
- [ ] Suite 7 (Session strategy) - 後続バッチ
- [ ] Suite 7a (Tenant 作成時シード) - 後続バッチ
- 注: ローカル実行は DATABASE_URL を別途設定する必要あり、CI が主要実行環境

### Step 16b: E2E テスト (Playwright)
- [x] `@playwright/test` インストール
- [x] `playwright.config.ts` - chromium・direct session injection 方式
- [x] `pages/api/test/_seed.ts` 拡張 - createSession アクション追加 (database セッション戦略の sessions 行を直接 INSERT)
- [x] `__tests__/e2e/helpers/seed.ts` - SeedClient (test seed API ラッパー)
- [x] `__tests__/e2e/helpers/auth.ts` - loginAs (Cookie 注入による direct session injection)
- [x] スペック 6 本実装:
  - 01-auth.spec.ts: 認証フロー (4 tests)
  - 02-journal-crud.spec.ts: US-T-010/011/012 (6 tests)
  - 03-timeline.spec.ts: US-T-014 共有/マイ記録の分離 (4 tests)
  - 04-tags.spec.ts: US-T-013/021 タグ関連 (5 tests)
  - 05-multi-tenant.spec.ts: 論点 H ブラウザ層検証 (4 tests)
  - 06-is-public-leak.spec.ts: SP-U02-04 ブラウザ層検証 (3 tests)
- [x] ci.yml に e2e-test ジョブ追加 (postgres service + Playwright + Next.js build + report upload)
- [x] vitest.config.ts の exclude に e2e ディレクトリ追加
- [x] .gitignore に playwright-report / test-results 追加
- [x] auth-options.ts: CredentialsProvider 追加を revert (database 戦略との互換性のため direct session injection 方式に確定)

**対応ストーリー**: 論点 F・H の実装検証

---

### Step 17: サプライチェーン対策（論点 L）
- [x] `.github/workflows/ci.yml` を全面改訂（4 ジョブに分割 + concurrency）
  - **secret-scan**: gitleaks/gitleaks-action（L-3・P2-A-3）
  - **dependency-audit**: OSV-Scanner（L-1、pnpm audit の代替・registry 410 問題回避）
  - **lockfile-check**: pnpm-lock.yaml の整合性検証（L-2）
  - **ci**: 既存の Lint/TypeCheck/Test
- [x] GitHub Actions を **SHA 固定**（actions/checkout・setup-node・pnpm/action-setup・gitleaks-action・aws-actions/* 全て）
- [x] `.github/workflows/deploy.yml` の AWS Actions も SHA 固定
- [x] `.github/dependabot.yml` 新規作成
  - GitHub Actions の SHA を週次更新
  - npm 依存パッケージを週次更新（prod/dev グルーピング）
- [x] `.githooks/pre-commit` に gitleaks 実行スクリプト（L-3 ローカル早期検知）
- [x] `.githooks/README.md` に開発者セットアップ手順
- [x] ECR Inspector スキャンは Unit-01 インフラ設計に既に記載済み（運用フェーズ対応）

### Step 17.5: Claude Code Review CI（Phase 1 最小構成）
- [x] `.github/workflows/claude-review.yml` 新規作成
  - PR 時に `src/`・`pages/`・`migrations/`・`__tests__/`・`package.json` の変更で起動
  - ANTHROPIC_API_KEY 未登録時は早期 skip（::warning:: 出力）
  - `continue-on-error: true` で必須 CI をブロックしない
  - 重大リスク 5項目のみ指摘する保守的な direct_prompt
  - Phase 2 移行手順と初回有効化チェックリストをコメントで残す
- [x] aidlc-docs/operations/claude-code-review-rollout.md と整合（Step 1 = この workflow ファイル）
- 注: 実際の有効化は ANTHROPIC_API_KEY 登録後（Phase 1 開始）

**対応ストーリー**: 論点 L 実装

---

### Step 18: ドキュメント + OpenAPI 仕様
- [x] `pnpm add -D @asteasolutions/zod-to-openapi@^7.3.4 yaml tsx` 依存追加
- [x] 既存の Zod スキーマに `.openapi()` メタデータ追加（journal.ts / tag.ts）
- [x] `src/openapi/schemas.ts` - レスポンス型・エラー型の Zod スキーマ
- [x] `src/openapi/registry.ts` - 9 operations の OpenAPI レジストリ
- [x] `scripts/gen-openapi.ts` - openapi.yaml 生成スクリプト
- [x] `pnpm gen:openapi` で `openapi.yaml` を生成（OpenAPI 3.1）
- [x] `package.json` に `gen:openapi` / `openapi:check` スクリプト
- [x] `.github/workflows/ci.yml` に `openapi:check` ステップ追加（Zod とのドリフト検知）
- [x] `aidlc-docs/construction/unit-02/code/code-summary.md` - 生成ファイル一覧と設計意図
- [x] `aidlc-docs/construction/unit-02/code/api-contracts.md` - REST API 仕様（人間可読概要・サンプル付き）
- [x] `aidlc-docs/construction/unit-02/code/database-schema.md` - スキーマ変更サマリー
- [x] ER 図の最終更新日を Step 18 完了時点に更新

---

### Step 19: デプロイ成果物
- [ ] `Dockerfile` の更新が必要な場合は差分を記述（基本は Unit-01 から変更なしの想定）
- [ ] CloudFront / WAF の設定手順を `aidlc-docs/construction/unit-02/code/deployment-steps.md` に記載
- [ ] Lambda `vitanota-db-migrator` のコード骨子を `scripts/db-migrator/` に配置（参考実装）

---

## 実装コスト見積もり
- Step 1-5 (データ・サービス層): ~8時間
- Step 6-9 (API 層): ~6時間
- Step 10 (Frontend): ~10時間
- Step 11 (ログ): ~1時間
- Step 12-15 (ユニットテスト): ~8時間
- Step 16 (統合テスト): ~8時間
- Step 17 (サプライチェーン): ~2時間
- Step 18-19 (ドキュメント): ~2時間
- **合計: 約 45 時間**

## ストーリートレーサビリティ

| ストーリー | 実装ステップ |
|---|---|
| US-T-010 (作成) | Step 1/2/3/4/5/7/10/13 |
| US-T-011 (編集) | Step 4/5/7/10/13 |
| US-T-012 (削除) | Step 4/5/7/10/13 |
| US-T-013 (タグ付与) | Step 3/4/5/7/10/13 |
| US-T-014 (タイムライン) | Step 4/6/10/12 |
| US-T-020/021/022 (感情) | Step 1/3/5/9/10（タグ統合実装） |

## 成果物ロケーション
- **アプリケーションコード**: `/Users/chimo/vitanota/` 配下（`src/features/journal/`・`pages/api/{public,private}/journal/`・`pages/journal/`・`__tests__/`）
- **マイグレーション**: `/Users/chimo/vitanota/migrations/0002〜0006_*.sql`
- **ドキュメント**: `aidlc-docs/construction/unit-02/code/` のみ（markdown サマリー）
