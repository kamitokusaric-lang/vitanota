// Step 16a Suite 1-2: マルチテナント隔離の統合テスト
// 実 PostgreSQL (testcontainers) で RLS と複合 FK の挙動を検証
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { startTestDb, stopTestDb, truncateAll, withTenantContext, type TestDb } from './helpers/testDb';
import { seedTenant, seedUser, seedEntry, seedTag, attachTag } from './helpers/seed';
import { journalEntries, tags, journalEntryTags, publicJournalEntries } from '@/db/schema';

describe('Suite 1: Baseline happy path', () => {
  let db: TestDb;
  let tenantA: Awaited<ReturnType<typeof seedTenant>>;
  let userA: Awaited<ReturnType<typeof seedUser>>;

  beforeAll(async () => {
    db = await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await truncateAll(db);
    tenantA = await seedTenant(db, '学校 A');
    userA = await seedUser(db, tenantA.id, 'teacher');
  });

  it('tenantA user creates and reads own entry', async () => {
    const entry = await seedEntry(db, {
      tenantId: tenantA.id,
      userId: userA.id,
      content: 'マイエントリ',
      isPublic: false,
    });

    const rows = await withTenantContext(db, tenantA.id, userA.id, async (tx) => {
      return tx
        .select()
        .from(journalEntries)
        .where(eq(journalEntries.id, entry.id));
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('マイエントリ');
  });

  it('tenantA user sees public entries via VIEW', async () => {
    await seedEntry(db, { tenantId: tenantA.id, userId: userA.id, isPublic: true });
    await seedEntry(db, { tenantId: tenantA.id, userId: userA.id, isPublic: true });
    await seedEntry(db, { tenantId: tenantA.id, userId: userA.id, isPublic: false });

    const rows = await withTenantContext(db, tenantA.id, userA.id, async (tx) => {
      return tx.select().from(publicJournalEntries);
    });

    // VIEW は is_public=true のみ
    expect(rows).toHaveLength(2);
  });

  it('tenantA user creates tenant-scoped tag', async () => {
    const tag = await seedTag(db, { tenantId: tenantA.id, userId: userA.id, name: 'カスタム' });
    expect(tag.name).toBe('カスタム');
    expect(tag.tenantId).toBe(tenantA.id);
  });
});

describe('Suite 2: Cross-tenant protection', () => {
  let db: TestDb;
  let tenantA: Awaited<ReturnType<typeof seedTenant>>;
  let tenantB: Awaited<ReturnType<typeof seedTenant>>;
  let userA: Awaited<ReturnType<typeof seedUser>>;
  let userB: Awaited<ReturnType<typeof seedUser>>;
  let entryA_public: Awaited<ReturnType<typeof seedEntry>>;
  let entryA_private: Awaited<ReturnType<typeof seedEntry>>;
  let entryB_public: Awaited<ReturnType<typeof seedEntry>>;
  let entryB_private: Awaited<ReturnType<typeof seedEntry>>;
  let tagA: Awaited<ReturnType<typeof seedTag>>;
  let tagB: Awaited<ReturnType<typeof seedTag>>;

  beforeAll(async () => {
    db = await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await truncateAll(db);
    tenantA = await seedTenant(db, '学校 A');
    tenantB = await seedTenant(db, '学校 B');
    userA = await seedUser(db, tenantA.id);
    userB = await seedUser(db, tenantB.id);

    entryA_public = await seedEntry(db, {
      tenantId: tenantA.id,
      userId: userA.id,
      content: 'A の公開',
      isPublic: true,
    });
    entryA_private = await seedEntry(db, {
      tenantId: tenantA.id,
      userId: userA.id,
      content: 'A の非公開',
      isPublic: false,
    });
    entryB_public = await seedEntry(db, {
      tenantId: tenantB.id,
      userId: userB.id,
      content: 'B の公開',
      isPublic: true,
    });
    entryB_private = await seedEntry(db, {
      tenantId: tenantB.id,
      userId: userB.id,
      content: 'B の非公開',
      isPublic: false,
    });

    tagA = await seedTag(db, { tenantId: tenantA.id, userId: userA.id, name: 'A タグ' });
    tagB = await seedTag(db, { tenantId: tenantB.id, userId: userB.id, name: 'B タグ' });
  });

  it('tenantA user CANNOT see tenantB public entry via VIEW', async () => {
    const rows = await withTenantContext(db, tenantA.id, userA.id, async (tx) => {
      return tx.select().from(publicJournalEntries);
    });
    expect(rows.every((r) => r.tenantId === tenantA.id)).toBe(true);
    expect(rows.find((r) => r.id === entryB_public.id)).toBeUndefined();
  });

  it('tenantA user CANNOT see tenantB private entry by direct id lookup', async () => {
    const rows = await withTenantContext(db, tenantA.id, userA.id, async (tx) => {
      return tx
        .select()
        .from(journalEntries)
        .where(eq(journalEntries.id, entryB_private.id));
    });
    expect(rows).toHaveLength(0);
  });

  it('tenantA user UPDATE attempt against tenantB entry affects 0 rows', async () => {
    const result = await withTenantContext(db, tenantA.id, userA.id, async (tx) => {
      return tx
        .update(journalEntries)
        .set({ content: 'hacked' })
        .where(eq(journalEntries.id, entryB_public.id))
        .returning();
    });
    expect(result).toHaveLength(0);
  });

  it('tenantA user DELETE attempt against tenantB entry affects 0 rows', async () => {
    const result = await withTenantContext(db, tenantA.id, userA.id, async (tx) => {
      return tx
        .delete(journalEntries)
        .where(eq(journalEntries.id, entryB_private.id))
        .returning();
    });
    expect(result).toHaveLength(0);
  });

  it('tenantA user CANNOT see tenantB tags', async () => {
    const rows = await withTenantContext(db, tenantA.id, userA.id, async (tx) => {
      return tx.select().from(tags);
    });
    expect(rows.every((r) => r.tenantId === tenantA.id)).toBe(true);
    expect(rows.find((r) => r.id === tagB.id)).toBeUndefined();
  });

  // SP-U02-04 Layer 8: 複合 FK によるクロステナント参照物理防止
  it('INSERT into journal_entry_tags with cross-tenant entry_id and tag_id fails at DB level', async () => {
    // tenantA のエントリ + tenantB のタグを生 SQL で挿入試行
    await expect(
      db.execute({
        sql: `INSERT INTO journal_entry_tags (tenant_id, entry_id, tag_id) VALUES ($1, $2, $3)`,
        args: [tenantA.id, entryA_public.id, tagB.id],
      } as never)
    ).rejects.toThrow();
  });

  it('legitimate same-tenant attach succeeds', async () => {
    await attachTag(db, {
      tenantId: tenantA.id,
      userId: userA.id,
      entryId: entryA_public.id,
      tagId: tagA.id,
    });
    const rows = await withTenantContext(db, tenantA.id, userA.id, async (tx) => {
      return tx
        .select()
        .from(journalEntryTags)
        .where(
          and(
            eq(journalEntryTags.entryId, entryA_public.id),
            eq(journalEntryTags.tagId, tagA.id)
          )
        );
    });
    expect(rows).toHaveLength(1);
  });
});
