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
- [ ] `pages/api/auth/[...nextauth].ts` を database セッション戦略に変更
- [ ] `@auth/drizzle-adapter` を導入（`sessions` テーブルと統合）
- [ ] アイドルタイムアウト 30分・絶対寿命 8時間の設定
- [ ] ロール変更時・テナント停止時のセッション失効フックを追加
- [ ] セッション監査ログ（session_created / session_revoked）

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

### Step 16: 統合テスト（integration-test-plan.md 準拠）
- [ ] `__tests__/integration/helpers/testDb.ts` - testcontainers PostgreSQL セットアップ
- [ ] `__tests__/integration/tenant-isolation.test.ts` - Suite 1-4（Baseline / Cross-tenant / Session leakage / RLS fail-safe）
- [ ] `__tests__/integration/is-public-leak.test.ts` - Suite 5（SP-U02-04 生存確認）
- [ ] `__tests__/integration/idor.test.ts` - Suite 6
- [ ] `__tests__/integration/session-strategy.test.ts` - Suite 7
- [ ] `vitest.config.ts` に integration 用設定追加

**対応ストーリー**: 論点 F・H の実装検証

---

### Step 17: サプライチェーン対策（論点 L）
- [ ] `.github/workflows/ci.yml` に以下を追加:
  - `pnpm audit --audit-level high` ステップ
  - gitleaks シークレットスキャン
  - ロックファイル整合性検証
- [ ] GitHub Actions を SHA 固定に更新
- [ ] ECR イメージスキャン（Amazon Inspector）の設定コメント追加
- [ ] `.githooks/pre-commit` に gitleaks 実行スクリプト

**対応ストーリー**: 論点 L 実装

---

### Step 18: コードサマリー文書
- [ ] `aidlc-docs/construction/unit-02/code/code-summary.md` - 生成ファイル一覧と設計意図
- [ ] `aidlc-docs/construction/unit-02/code/api-contracts.md` - REST API 仕様（パス・リクエスト/レスポンス）
- [ ] `aidlc-docs/construction/unit-02/code/database-schema.md` - スキーマ変更サマリー

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
