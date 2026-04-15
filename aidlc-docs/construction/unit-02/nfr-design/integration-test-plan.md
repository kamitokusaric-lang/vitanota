# Unit-02 統合テスト計画（マルチテナント隔離検証）

## 目的

Unit-02 の機能実装において、以下のリスクに対する回帰検証を自動化する：

- **R1**: RDS Proxy セッションピンニング（`SET LOCAL` の漏れ・ピン多発）
- **R5**: RLS ポリシー設計バグ・セッション変数未設定時の fail-safe
- **論点 F**: is_public 漏えい多層防御（SP-U02-04）の生存確認
- **論点 H**: マルチテナント隔離の仮定検証（RDS Proxy セッション再利用時の app.tenant_id 漏えい）

すべてのテストは**実 PostgreSQL**（testcontainers）に対して実行する。モック不可。

---

## テスト環境

### インフラ
- **テスト DB**: testcontainers で PostgreSQL 16 をスポーン
- **マイグレーション**: 起動時に全マイグレーション（Unit-01 + Unit-02）を適用
- **クリーンアップ**: 各 describe ブロック開始時に全テーブル TRUNCATE
- **RLS**: 本番同等のポリシーを有効化
- **接続方式**: pg ドライバ直接（RDS Proxy は CI で再現不要、ただしピンニング検証は prod で別途計測）

### テストランナー
- **Vitest**（Unit-01 のテストスタック継承）
- **CI**: GitHub Actions で必須化、失敗したら deploy ブロック
- **並列実行**: テスト間の DB 隔離を確保するため直列実行（`--pool threads --poolOptions.threads.singleThread`）

### ヘルパー
```ts
// __tests__/helpers/testDb.ts
export async function seedTenant(name: string): Promise<{ id: string; name: string }>
export async function seedUser(tenantId: string, role: UserRole): Promise<User>
export async function seedEntry(params: { tenantId, userId, isPublic, content }): Promise<JournalEntry>
export async function withTestTenant<T>(tenantId, userId, fn: (tx) => Promise<T>): Promise<T>
export async function rawQuery<T>(sql: string, params?: any[]): Promise<T[]>  // RLS を通さない raw クエリ（検証用）
```

---

## テストスイート構成

### Suite 1: Baseline happy path

各テナント内で期待通り動作することを確認する。

```ts
describe('Baseline: tenant内正常系', () => {
  it('tenantA user creates and reads own entry')
  it('tenantA user sees tenantA public timeline')
  it('tenantA user updates own entry')
  it('tenantA user deletes own entry')
  it('tenantA user creates tenant-scoped tag')
})
```

---

### Suite 2: Cross-tenant protection

別テナントのリソースに一切アクセスできないことを確認する。

```ts
describe('Cross-tenant protection', () => {
  beforeEach(async () => {
    // tenantA・tenantB それぞれに user + entry + tag を作成
    tenantA = await seedTenant('A')
    tenantB = await seedTenant('B')
    userA = await seedUser(tenantA.id, 'teacher')
    userB = await seedUser(tenantB.id, 'teacher')
    entryA_public = await seedEntry({ tenantId: tenantA.id, userId: userA.id, isPublic: true })
    entryA_private = await seedEntry({ tenantId: tenantA.id, userId: userA.id, isPublic: false })
    entryB_public = await seedEntry({ tenantId: tenantB.id, userId: userB.id, isPublic: true })
    entryB_private = await seedEntry({ tenantId: tenantB.id, userId: userB.id, isPublic: false })
  })

  it('tenantA user CANNOT see tenantB public entry via timeline', async () => {
    const result = await withTestTenant(tenantA.id, userA.id, (tx) =>
      tx.select().from(publicJournalEntries)
    )
    expect(result.every(r => r.tenantId === tenantA.id)).toBe(true)
    expect(result.find(r => r.id === entryB_public.id)).toBeUndefined()
  })

  it('tenantA user CANNOT see tenantB private entry by ID lookup')
  it('tenantA user CANNOT update tenantB entry by forging tenantId in SET LOCAL')
  it('tenantA user CANNOT delete tenantB entry by ID guessing')
  it('tenantA user CANNOT create entry in tenantB by spoofing in payload')
  it('tenantA user CANNOT see tenantB tags')
  it('tenantA school_admin CANNOT see tenantB tags or delete them')
  it('tenantA user attempting UPDATE with tenantB ID affects 0 rows')
  it('tenantA user attempting DELETE with tenantB ID affects 0 rows')

  // SP-U02-04 Layer 8: 複合 FK によるクロステナント参照物理防止
  it('INSERT into journal_entry_tags with cross-tenant entry_id and tag_id fails at DB level', async () => {
    // テナントA のエントリ + テナントB のタグ
    const entryA = entryA_public
    const tagB = await seedTag({ tenantId: tenantB.id, name: 'tenantB-tag' })

    // 生 SQL で直接挿入を試みる（アプリ層の検証をバイパス）
    await expect(
      rawQuery(
        `INSERT INTO journal_entry_tags (tenant_id, entry_id, tag_id) VALUES ($1, $2, $3)`,
        [tenantA.id, entryA.id, tagB.id]  // tagB は tenant_id=tenantB なので FK violation
      )
    ).rejects.toThrow(/foreign key/i)
  })

  it('INSERT with mismatched tenant_id in middle table fails', async () => {
    // 中間テーブルに tenantB を指定、entry は tenantA → FK violation
    await expect(
      rawQuery(
        `INSERT INTO journal_entry_tags (tenant_id, entry_id, tag_id) VALUES ($1, $2, $3)`,
        [tenantB.id, entryA_public.id, tagA.id]
      )
    ).rejects.toThrow(/foreign key/i)
  })
})
```

---

### Suite 3: Session variable leakage（論点 H 最重要）

RDS Proxy の接続再利用を想定し、セッション変数が前のリクエストから引き継がれないことを確認する。

```ts
describe('Session variable leakage (R1/論点H)', () => {
  it('after tenantA transaction, new connection without SET LOCAL sees zero rows', async () => {
    // tenantA としてクエリ実行
    await withTestTenant(tenantA.id, userA.id, async (tx) => {
      await tx.select().from(journalEntries)  // RLS で tenantA の行のみ
    })
    // 同じ接続プールから新しい接続を取得し、SET LOCAL せずにクエリ
    const rowsWithoutContext = await db.select().from(journalEntries)
    // RLS + missing_ok により全拒否（fail-safe）
    expect(rowsWithoutContext).toHaveLength(0)
  })

  it('two concurrent requests with different tenants do not cross-contaminate', async () => {
    const [rowsA, rowsB] = await Promise.all([
      withTestTenant(tenantA.id, userA.id, (tx) => tx.select().from(journalEntries)),
      withTestTenant(tenantB.id, userB.id, (tx) => tx.select().from(journalEntries)),
    ])
    expect(rowsA.every(r => r.tenantId === tenantA.id)).toBe(true)
    expect(rowsB.every(r => r.tenantId === tenantB.id)).toBe(true)
  })

  it('RESET LOCAL after transaction clears app.tenant_id', async () => {
    await withTestTenant(tenantA.id, userA.id, async (tx) => { /* ... */ })
    // トランザクション終了後、同じ接続で current_setting を取得
    const setting = await rawQuery<{ setting: string | null }>(
      `SELECT current_setting('app.tenant_id', true) as setting`
    )
    expect(setting[0].setting).toBeNull()
  })

  it('100 concurrent requests with random tenant assignment maintain isolation', async () => {
    // ストレステスト的な検証。並列リクエストの結果が正しいテナントのみ返すこと
    const tenants = [tenantA, tenantB]
    const results = await Promise.all(
      Array.from({ length: 100 }, async (_, i) => {
        const t = tenants[i % 2]
        const u = i % 2 === 0 ? userA : userB
        const rows = await withTestTenant(t.id, u.id, (tx) => tx.select().from(journalEntries))
        return { expected: t.id, actual: rows.map(r => r.tenantId) }
      })
    )
    results.forEach(({ expected, actual }) => {
      expect(actual.every(id => id === expected)).toBe(true)
    })
  })
})
```

---

### Suite 4: RLS fail-safe

セッション変数が未設定・不正な場合に全拒否されることを確認する。

```ts
describe('RLS fail-safe', () => {
  it('query without app.tenant_id set returns zero rows', async () => {
    const rows = await rawQuery('SELECT * FROM journal_entries')
    expect(rows).toHaveLength(0)
  })

  it('query with NULL app.tenant_id returns zero rows', async () => {
    await rawQuery(`SET LOCAL app.tenant_id = ''`)  // 空文字は uuid キャストで NULL になる
    const rows = await rawQuery('SELECT * FROM journal_entries')
    expect(rows).toHaveLength(0)
  })

  it('query with invalid UUID in app.tenant_id throws or returns zero', async () => {
    try {
      await rawQuery(`SET LOCAL app.tenant_id = 'not-a-uuid'`)
      const rows = await rawQuery('SELECT * FROM journal_entries')
      expect(rows).toHaveLength(0)
    } catch (e) {
      // UUID キャストエラーは許容（アプリ層で適切にハンドリング必須）
      expect(e).toBeDefined()
    }
  })

  it('direct access to public_journal_entries VIEW without context returns zero', async () => {
    const rows = await rawQuery('SELECT * FROM public_journal_entries')
    expect(rows).toHaveLength(0)
  })
})
```

---

### Suite 5: is_public 漏えい防止（SP-U02-04 生存確認）

7層防御が実際に機能していることを確認する。

```ts
describe('is_public leak prevention (SP-U02-04)', () => {
  beforeEach(async () => {
    await seedEntries({ tenantId: tenantA.id, userId: userA.id, isPublic: false, count: 100 })
    await seedEntries({ tenantId: tenantA.id, userId: userA.id, isPublic: true, count: 5 })
  })

  it('public timeline never returns is_public=false entries', async () => {
    const entries = await withTestTenant(tenantA.id, userA.id, (tx) =>
      publicTimelineRepo.findTimeline(tx, { limit: 200, offset: 0 })
    )
    expect(entries).toHaveLength(5)
  })

  it('public_journal_entries VIEW does not expose is_public column', async () => {
    const columns = await rawQuery<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'public_journal_entries'`
    )
    expect(columns.map(c => c.column_name)).not.toContain('is_public')
  })

  it('PublicTimelineRepository return type is not assignable to JournalEntry', () => {
    // TypeScript コンパイル時チェック（型レベル）
    // @ts-expect-error - PublicJournalEntry is not assignable to JournalEntry without isPublic
    const _: JournalEntry = {} as PublicJournalEntry
  })

  it('fuzzing: 1000 random non-public entries never leak', async () => {
    await seedRandomEntries({ tenantId: tenantA.id, userId: userA.id, isPublic: false, count: 1000 })
    const entries = await withTestTenant(tenantA.id, userA.id, (tx) =>
      publicTimelineRepo.findTimeline(tx, { limit: 2000, offset: 0 })
    )
    expect(entries).toHaveLength(5)  // 最初の public 5件のみ
  })

  it('even if app bug calls raw journal_entries with no WHERE, RLS enforces public_read', async () => {
    // 敵対的シミュレーション: アプリバグで生テーブルを叩く
    const rows = await withTestTenant(tenantA.id, userA.id, (tx) =>
      tx.execute(sql`SELECT * FROM journal_entries WHERE tenant_id = ${tenantA.id}`)
    )
    // RLS public_read + owner_all の OR で自分の private は見える、他人の private は見えない
    // このテストは userA 自身のクエリなので全件見える。別ユーザーで検証するのが正しい
    const otherUserA2 = await seedUser(tenantA.id, 'teacher')
    const rows2 = await withTestTenant(tenantA.id, otherUserA2.id, (tx) =>
      tx.execute(sql`SELECT * FROM journal_entries`)
    )
    // otherUserA2 が見えるのは is_public=true のみ
    expect(rows2.every(r => r.is_public === true)).toBe(true)
  })
})
```

---

### Suite 6: IDOR 防止（SP-U02-03）

所有者以外がリソースを変更・削除できないことを確認する。

```ts
describe('IDOR prevention', () => {
  it('tenantA user1 CANNOT update tenantA user2 entry', async () => {
    const user1 = await seedUser(tenantA.id, 'teacher')
    const user2 = await seedUser(tenantA.id, 'teacher')
    const entry = await seedEntry({ tenantId: tenantA.id, userId: user2.id, isPublic: false })

    const result = await withTestTenant(tenantA.id, user1.id, (tx) =>
      privateJournalRepo.update(tx, entry.id, { content: 'hacked' }, { userId: user1.id, tenantId: tenantA.id })
    )
    expect(result).toBeNull()  // 404 マッピング
  })

  it('tenantA user1 CANNOT delete tenantA user2 entry')
  it('tenantA user1 CAN read tenantA user2 public entry via public timeline')
  it('tenantA user1 CANNOT read tenantA user2 private entry via mine endpoint')
})
```

---

### Suite 7a: Tenant 作成時のデフォルトタグシード（NFR-U02-03）

テナント作成 API が同一トランザクション内で 8件のデフォルトタグをシードすることを検証。

```ts
describe('Tenant creation seeds system default tags (NFR-U02-03)', () => {
  it('creates tenant and 8 system default tags in single transaction')
  it('seeded tags have is_system_default=true and created_by=null')
  it('seeded tags contain 5 emotion + 3 task tags')
  it('if tag seed fails, tenant insert is rolled back (atomicity)')
  it('seeded tags are visible to subsequent GET /api/private/journal/tags')
  it('system default tags cannot be deleted by school_admin')
})
```

---

### Suite 7: Session strategy（Unit-01 SP-07 の検証）

Auth.js database セッション戦略が期待通り動作することを確認する。

```ts
describe('Database session strategy', () => {
  it('session created on login is stored in sessions table')
  it('session lookup rejects expired sessions')
  it('session lookup rejects sessions idle for > 30 minutes')
  it('DELETE FROM sessions WHERE user_id = ? revokes all user sessions immediately')
  it('role change on user triggers session revocation')
  it('tenant suspension triggers session revocation for all tenant users')
  it('session_token is never exposed in API responses')
  it('session monitoring: last_accessed_at updates only after 5 minutes')
})
```

---

### Suite 8: RDS Proxy pinning detection（prod 環境のみ）

**CI では実行しない**（testcontainers は RDS Proxy を使わないため）。本番運用時の監視項目として記載。

**運用手順**:
1. dev/prod 環境で CloudWatch メトリクス `DatabaseConnectionsCurrentlySessionPinned` を常時監視
2. ピン率 > 5% でアラーム発報
3. 発生時の対応 Runbook: `SET LOCAL` 未使用箇所の調査・修正

---

## 実行とカバレッジ

### ローカル実行
```bash
pnpm vitest run __tests__/integration/
```

### CI 実行
```yaml
# .github/workflows/ci.yml
- name: Integration tests (with testcontainers)
  run: pnpm vitest run __tests__/integration/ --coverage
  env:
    CI: true
```

### カバレッジ目標
- マルチテナント隔離関連コード: **100%**（全分岐をテスト）
- RLS 評価パス: **100%**
- Repository 分離: 型チェックで代替（実行時テストはスモークレベル）

### 失敗時の対応
- CI で failure → main ブランチへのマージブロック
- 特に Suite 2・3・4・5 の失敗は**セキュリティインシデント扱い**とし、即時修正

---

## テスト投入スケジュール

| タイミング | 対応 |
|---|---|
| Unit-02 コード生成フェーズ | 全 Suite を実装 |
| Unit-02 リリース前 | 全 Suite が CI で GREEN になることを確認 |
| Unit-03/04 追加時 | テナント境界を持つ新機能ごとに Suite 2/3 を拡張 |
| 四半期レビュー | Suite 実行結果とカバレッジのレビュー |

---

## 関連リスク

本計画は以下のリスクへの対応である：

- `operational-risks.md` R1（RDS Proxy ピンニング）
- `operational-risks.md` R5（RLS ポリシー設計）
- `security-review.md` 論点 F（PII エッジキャッシュ混入）
- `security-review.md` 論点 H（マルチテナント隔離の仮定）
