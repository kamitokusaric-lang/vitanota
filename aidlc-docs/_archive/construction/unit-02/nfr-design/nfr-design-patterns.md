# Unit-02 NFR設計パターン

## 概要

Unit-02（日誌・感情記録コア）で適用する NFR パターン。Unit-01 の全パターン（SP-01〜06・RP-01〜02・PP-01〜02・OP-01〜02）を継承し、Unit-02 固有の追加パターンを定義する。

---

## Unit-01 から継承するパターン

| ID | パターン | Unit-02 での適用 |
|---|---|---|
| SP-01 | Redact（pino） | 日誌本文・タグ名を機密候補としてログ出力時マスキング |
| SP-02 | IAM トークン認証（RDS Proxy） | そのまま利用 |
| SP-03 | シークレットキャッシュ | そのまま利用 |
| SP-04 | 多層防御 | Layer 0-5 をそのまま適用、Unit-02 は Layer 5 の RLS を拡張 |
| SP-05 | エッジ防御（CloudFront+WAF） | そのまま利用 |
| SP-06 | オリジン保護（署名ヘッダー） | そのまま利用 |
| RP-01 | フェイルセーフデフォルト | 日誌取得失敗時は 500 + 空配列ではなく 500 を明示 |
| RP-02 | ヘルスチェック | そのまま利用 |
| PP-01 | Drizzle コネクション管理 | そのまま利用、**トランザクション必須化を強化**（R1対策） |
| PP-02 | エッジキャッシュ | NFR-U02-02 で活用 |
| OP-01 | 構造化ログイベント | 日誌作成・更新・削除イベントを追加 |
| OP-02 | CloudWatch アラーム | そのまま利用 |

---

## Unit-02 固有パターン

### SP-U02-01: 二層バリデーションパターン（Zod スキーマ共有）

**目的**: NFR-U02-05 準拠。クライアントと API 層で同一の Zod スキーマを使用し、バリデーション定義の重複を排除する。

**構成**:
```
[lib/schemas/journal.ts]
  export const createEntrySchema = z.object({
    content: z.string().min(1).max(200),
    tagIds: z.array(z.string().uuid()).max(10),  // 感情タグ・業務タグ統合
    isPublic: z.boolean(),
  })
  export type CreateEntryInput = z.infer<typeof createEntrySchema>
         ↓ import 共有
[クライアント層]                [API 層]
 React Hook Form +              pages/api/private/journal/entries.ts
 zodResolver(schema)            schema.parse(req.body)
         ↓ 失敗                         ↓ 失敗
 フォーム下にエラー表示           400 Bad Request + エラー詳細
```

**実装指針**:
- スキーマは `lib/schemas/` ディレクトリに集約（journal.ts・tag.ts・entry.ts など）
- クライアント・サーバー共通で import 可能（Next.js Pages Router では `lib/` は両方から参照可）
- 派生型は `z.infer<typeof schema>` で生成し手書きしない
- DB 層の CHECK 制約は**使用しない**（理由: 仕様変更時のマイグレーション負荷を回避）

---

### SP-U02-02: RLS 2ポリシー構成パターン

**目的**: NFR-U02-04 準拠。共有タイムライン（公開エントリの他者参照）と所有者アクセス（非公開含む全操作）を PostgreSQL RLS の PERMISSIVE 2ポリシーで実現する。

**ポリシー定義**:
```sql
-- 前提: journal_entries に RLS 有効化
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

-- ポリシー1: 共有タイムライン（公開エントリはテナント内全員が SELECT 可能）
CREATE POLICY journal_entry_public_read ON journal_entries
  AS PERMISSIVE
  FOR SELECT
  USING (
    is_public = true
    AND tenant_id = current_setting('app.tenant_id', true)::uuid
  );

-- ポリシー2: 所有者アクセス（全操作可・非公開エントリも含む）
CREATE POLICY journal_entry_owner_all ON journal_entries
  AS PERMISSIVE
  FOR ALL
  USING (
    user_id = current_setting('app.user_id', true)::uuid
    AND tenant_id = current_setting('app.tenant_id', true)::uuid
  )
  WITH CHECK (
    user_id = current_setting('app.user_id', true)::uuid
    AND tenant_id = current_setting('app.tenant_id', true)::uuid
  );
```

**評価ロジック（PERMISSIVE の OR 結合）**:
```
最終条件 = (is_public AND tenant_match) OR (user_match AND tenant_match)
        = tenant_match AND (is_public OR user_match)
```

**Fail-safe 設計**:
- `current_setting('app.tenant_id', true)` の第2引数 `true` は missing_ok → セッション変数未設定時は NULL を返す
- `uuid` キャストでエラーにならず、比較が NULL → 常に偽
- **セッション変数を忘れると全拒否**（安全側に倒れる）

**R1対策（ピンニング回避）**:
`SET LOCAL` をトランザクション内でのみ実行する。Unit-02 の全クエリは `db.transaction()` 内で実行することを必須化。

---

### SP-U02-03: IDOR 防止二重チェックパターン

**目的**: NFR-U02-05 SECURITY-08 準拠。エントリ更新・削除の所有者検証を API 層と DB 層で二重に実施する。

**構成**:
```
[API 層: pages/api/private/journal/entries/[id].ts]
  const { userId, tenantId } = session
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`)
    await tx.execute(sql`SET LOCAL app.user_id = ${userId}`)

    // Layer 1: API 層の明示チェック
    const result = await tx
      .update(journalEntries)
      .set({ content })
      .where(
        and(
          eq(journalEntries.id, id),
          eq(journalEntries.userId, userId),  // ← 所有者明示
        )
      )
      .returning()

    if (result.length === 0) {
      return res.status(404).json({ error: 'Entry not found' })
    }
    // Layer 2: RLS が WITH CHECK でも user_id を検証
  })
```

**防御層**:
- **Layer 1（API層）**: WHERE 句で `user_id = ?` を明示。404 返却で存在有無を隠蔽。
- **Layer 2（RLS）**: PostgreSQL の RLS が WITH CHECK で再度検証。API層のバグを保険でカバー。

---

### SP-U02-04: is_public 漏えい防止多層防御パターン

**目的**: 教員の非公開エントリ（`is_public=false`）が共有タイムラインに漏えいすることを絶対に防ぐ。教育機関向け BtoB の信頼性要件として、ソースコードのバグや設定ミスに対する**物理的な防衛線**を複数層で構築する。

**8層防御**（Layer 8 は 2026-04-15 改訂4 で追加）:

```
Layer 1: CloudFront パス名前空間分離
  /api/public/*   → キャッシュ可能（is_public=true のみ）
  /api/private/*  → CachingDisabled（個人情報含む）
      ↓
Layer 2: エンドポイント分離
  pages/api/public/journal/entries.ts   → GET のみ、公開タイムライン
  pages/api/private/journal/entries/mine.ts → GET のみ、マイ記録
  pages/api/private/journal/entries.ts  → POST のみ、作成
  pages/api/private/journal/entries/[id].ts → PUT/DELETE のみ、更新・削除
      ↓
Layer 3: Repository 型分離
  PublicTimelineRepository（公開ビュー専用・型ブランド PublicJournalEntry）
  PrivateJournalRepository（CRUD 全般・型 JournalEntry）
  → TypeScript のコンパイル時チェックで誤用を検出
      ↓
Layer 4: PostgreSQL VIEW `public_journal_entries`
  CREATE VIEW public_journal_entries AS
    SELECT id, tenant_id, user_id, content, created_at, updated_at
    FROM journal_entries WHERE is_public = true;
  → View 定義自体が WHERE 句を内包。is_public 列自体も返さない
      ↓
Layer 5: RLS public_read ポリシー
  USING (is_public = true AND tenant_id = current_setting('app.tenant_id'))
  → DB層で最終強制
      ↓
Layer 6: アプリ層の明示 WHERE 句（冗長だが保険）
  db.select().from(publicJournalEntries) // View 使用、追加 WHERE 不要
      ↓
Layer 7: 統合テスト強制（CI ブロック）
  describe('Public timeline never leaks is_public=false entries', ...)
      ↓
Layer 8: DB 複合 FK によるクロステナント参照物理防止
  journal_entry_tags に tenant_id 冗長列追加
  FOREIGN KEY (entry_id, tenant_id) REFERENCES journal_entries(id, tenant_id)
  FOREIGN KEY (tag_id, tenant_id) REFERENCES tags(id, tenant_id)
  → テナント A エントリ × テナント B タグの紐づけを FK violation で拒否
```

**各層の効果**:

| Layer | バグシナリオ | 防御効果 |
|---|---|---|
| 1 CloudFront パス | `/api/public/*` に private レスポンスが流れる | パスが分離されているため物理的に不可 |
| 2 エンドポイント分離 | 公開タイムラインに個人情報混入 | ハンドラファイルが別のため混入経路なし |
| 3 Repository 分離 | 誤って private repo の結果を public 返却 | 型エラーでコンパイル失敗 |
| 4 DB View | アプリコードで WHERE 忘れ | View 定義が WHERE を内包、列自体が見えない |
| 5 RLS | View が無効化される事故 | DB 層で最終チェック |
| 6 明示 WHERE | 多重化の保険 | 冗長だが無料の保険 |
| 7 テスト | 上記全ての回帰検知 | CI で継続検証 |
| 8 複合 FK | アプリバグ・生 SQL でクロステナント参照発生 | DB エンジンが FK violation で即拒否、RLS を経由せず物理防止 |

**Repository 型ブランドの実装**:
```ts
// lib/types/brand.ts
type Brand<T, B> = T & { readonly __brand: B }
export type PublicJournalEntry = Brand<JournalEntry, 'public'>

// lib/repositories/publicTimelineRepository.ts
export class PublicTimelineRepository {
  async findTimeline(tx: Tx, opts: TimelineOptions): Promise<PublicJournalEntry[]> {
    const rows = await tx
      .select()
      .from(publicJournalEntries)  // View を使用
      .orderBy(desc(publicJournalEntries.createdAt))
      .limit(opts.limit)
      .offset(opts.offset)
    return rows as PublicJournalEntry[]  // 型ブランド付与
  }
  // 他のメソッドは存在しない（意図的）
}

// lib/repositories/privateJournalRepository.ts
export class PrivateJournalRepository {
  async create(...): Promise<JournalEntry> { /* ... */ }
  async update(...): Promise<JournalEntry | null> { /* ... */ }
  async delete(...): Promise<boolean> { /* ... */ }
  async findMine(...): Promise<JournalEntry[]> { /* ... */ }
  async findById(...): Promise<JournalEntry | null> { /* ... */ }
  // findTimeline は存在しない（意図的）
}
```

**API 層での使用**:
```ts
// pages/api/public/journal/entries.ts
import { publicTimelineRepo } from '@/lib/repositories/publicTimelineRepository'
export default withTenant(async (req, res, { tenantId, userId }) => {
  const entries: PublicJournalEntry[] = await publicTimelineRepo.findTimeline(tx, opts)
  res.json({ entries })  // 型上 is_public=false を含められない
})

// pages/api/private/journal/entries/mine.ts
import { privateJournalRepo } from '@/lib/repositories/privateJournalRepository'
// これらの型は JournalEntry（is_public を含む可能性あり）
```

**統合テスト例**（Layer 7）:
```ts
describe('is_public leak prevention', () => {
  it('public timeline never returns is_public=false entries', async () => {
    await createEntries({ tenant: 'A', isPublic: false, count: 100 })
    await createEntries({ tenant: 'A', isPublic: true, count: 5 })
    const res = await GET('/api/public/journal/entries', { as: 'userA' })
    expect(res.body.entries).toHaveLength(5)
    // is_public 列自体が View で除外されているため、レスポンスに存在しない
    res.body.entries.forEach(e => expect(e).not.toHaveProperty('isPublic'))
  })
})
```

---

### PP-U02-01: クライアントサイドタグフィルタパターン

**目的**: NFR-U02-01 準拠。20件上限のタグ UI で、テナント内タグが20件超の場合にクライアント側フィルタリングを提供する。

**実装**:
```tsx
const { data: tags } = useSWR('/api/journal/tags', fetcher)
const [query, setQuery] = useState('')

const filteredTags = useMemo(() => {
  if (!tags) return []
  const normalized = query.trim().toLowerCase()
  if (!normalized) return tags.slice(0, 20)
  return tags.filter(t => t.name.toLowerCase().includes(normalized))
}, [tags, query])
```

**特性**:
- 初期表示: sort_order → name 順の先頭20件
- 入力時: 全タグに対して `includes()` で部分一致フィルタ（件数制限なし）
- 100ms 以内に完了（クライアント処理、NFR-U02-01）
- Fuse.js 等の追加ライブラリ不要

---

### PP-U02-02: エッジキャッシュ適用パターン（タイムライン）

**目的**: NFR-U02-02 準拠。共有タイムライン API に SWR キャッシュを適用する。

**実装**:
```ts
// pages/api/public/journal/entries.ts
export default withTenant(async (req, res, { userId, tenantId }) => {
  if (req.method === 'GET') {
    // 共有タイムライン: エッジキャッシュ有効化
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')

    const entries = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`)
      await tx.execute(sql`SET LOCAL app.user_id = ${userId}`)
      return tx.select().from(journalEntries)
        .where(eq(journalEntries.isPublic, true))
        .orderBy(desc(journalEntries.createdAt))
        .limit(20)
    })
    return res.json({ entries })
  }
  // POST: エッジキャッシュを無効化（デフォルトで CachingDisabled）
})

// pages/api/private/journal/entries/mine.ts
export default withTenant(async (req, res, { userId, tenantId }) => {
  // マイ記録: 非公開エントリを含むためキャッシュ禁止
  res.setHeader('Cache-Control', 'private, no-store')
  // ... 省略
})
```

**キャッシュキー設計**:
- CloudFront のキャッシュポリシーで `Authorization` / `Cookie` を含めない（テナント共有キャッシュ）
- クエリパラメータ（ページネーション）はキャッシュキーに含める
- マイ記録は `private, no-store` で CloudFront をバイパス

**R4 の受容**:
- エントリ投稿後、CloudFront エッジキャッシュは最大 90秒間古い
- クライアント側は SWR `mutate()` で即時再フェッチし楽観的に最新を表示
- エッジキャッシュの不整合は 30秒遅延まで受容（NFR-U02-02 の設計意図）

---

### RP-U02-01: トランザクション必須化パターン

**目的**: R1（RDS Proxy ピンニング）の予防。全 DB アクセスをトランザクション内に限定する。

**原則**:
- `db.select()` / `db.insert()` / `db.update()` / `db.delete()` の**直接呼び出しは禁止**
- 必ず `db.transaction(async (tx) => { ... })` 内で実行
- `SET LOCAL` は必ずトランザクション先頭で発行

**共通ヘルパー（Unit-01 の withTenant を拡張）**:
```ts
// lib/db/withTenant.ts
export function withTenant<T>(
  handler: (tx: Transaction, ctx: Context) => Promise<T>
): (req, res) => Promise<T> {
  return async (req, res) => {
    const { userId, tenantId } = await requireSession(req, res)
    return db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`)
      await tx.execute(sql`SET LOCAL app.user_id = ${userId}`)
      return handler(tx, { userId, tenantId })
    })
  }
}
```

**ESLint ルール**（推奨）:
- `no-restricted-syntax` で `db.select()` の直接呼び出しを警告

---

### OP-U02-01: 日誌イベントログパターン

**目的**: OP-01 の拡張。日誌操作の監査証跡を構造化ログで記録する。

**イベント定義**:
```ts
// lib/log/events.ts

// 書き込みイベント
logger.info({ event: 'journal_entry_created', entryId, userId, tenantId, isPublic, tagCount })
logger.info({ event: 'journal_entry_updated', entryId, userId, tenantId })
logger.info({ event: 'journal_entry_deleted', entryId, userId, tenantId })
logger.info({ event: 'tag_created', tagId, userId, tenantId, name })
logger.info({ event: 'tag_deleted', tagId, userId, tenantId, affectedEntries })

// 読み取りイベント（P1-D 対応・2026-04-15 追加）
logger.info({ event: 'journal_entry_read', entryId, userId, tenantId, isPublic, accessType: 'owner'|'public_feed' })
logger.info({ event: 'journal_entry_list_read', userId, tenantId, endpoint: 'public'|'mine', count })
logger.info({ event: 'tag_list_read', userId, tenantId, count })
```

**読み取りイベントの目的**（P1-D 対応）:
- 「誰が非公開エントリを読んだか」の事後追跡を可能にする
- 教育機関の監査要件に対応
- S3 Object Lock 付き監査ログストレージに転送され、7年保持

**SP-01（Redact）との関係**:
- 日誌本文（`content` フィールド）は**ログに出力しない**
- タグ名は出力可（テナント内で共有される識別子のため）
- 機密情報分類: 本文＝要保護、タグ名＝非機密

---

## 運用リスクとの紐づけ

本設計は `operational-risks.md` の以下リスクに対応する：

| リスク | 対応パターン |
|---|---|
| R1 ピンニング | RP-U02-01 トランザクション必須化 |
| R4 二重キャッシュ | PP-U02-02 の「R4 の受容」節 |
| R5 RLS ポリシー | SP-U02-02 の Fail-safe 設計 |
| R7 マイグレーション競合 | （デプロイ運用側で対応） |
| R11 署名ヘッダー | （SP-06 の運用 Runbook） |
| R12 WAF 誤検知 | （WAF ログ監視） |
