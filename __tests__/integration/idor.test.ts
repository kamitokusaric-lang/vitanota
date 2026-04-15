// Step 16a Suite 6: IDOR (Insecure Direct Object Reference) prevention
// SP-U02-03: API 層 WHERE + RLS WITH CHECK の二重防御を直接検証
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, and } from 'drizzle-orm';
import {
  startTestDb,
  stopTestDb,
  truncateAll,
  withTenantContext,
  type TestDb,
} from './helpers/testDb';
import { seedTenant, seedUser, seedEntry } from './helpers/seed';
import { journalEntries } from '@/db/schema';

describe('Suite 6: IDOR prevention (SP-U02-03)', () => {
  let db: TestDb;
  let tenantA: Awaited<ReturnType<typeof seedTenant>>;
  let user1: Awaited<ReturnType<typeof seedUser>>;
  let user2: Awaited<ReturnType<typeof seedUser>>;
  let entry1Public: Awaited<ReturnType<typeof seedEntry>>;
  let entry1Private: Awaited<ReturnType<typeof seedEntry>>;
  let entry2Private: Awaited<ReturnType<typeof seedEntry>>;

  beforeAll(async () => {
    db = await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await truncateAll(db);
    tenantA = await seedTenant(db, '学校 A');
    user1 = await seedUser(db, tenantA.id, 'teacher', 'u1@test.example.com');
    user2 = await seedUser(db, tenantA.id, 'teacher', 'u2@test.example.com');

    entry1Public = await seedEntry(db, {
      tenantId: tenantA.id,
      userId: user1.id,
      content: 'user1 公開',
      isPublic: true,
    });
    entry1Private = await seedEntry(db, {
      tenantId: tenantA.id,
      userId: user1.id,
      content: 'user1 非公開',
      isPublic: false,
    });
    entry2Private = await seedEntry(db, {
      tenantId: tenantA.id,
      userId: user2.id,
      content: 'user2 非公開',
      isPublic: false,
    });
  });

  it('user2 cannot UPDATE user1 entry (RLS owner_all blocks at DB layer)', async () => {
    const result = await withTenantContext(db, tenantA.id, user2.id, async (tx) => {
      return tx
        .update(journalEntries)
        .set({ content: 'hacked by user2' })
        .where(eq(journalEntries.id, entry1Private.id))
        .returning();
    });
    expect(result).toHaveLength(0);
  });

  it('user2 cannot UPDATE user1 entry even with explicit WHERE on user_id', async () => {
    // API 層を模した明示 WHERE
    const result = await withTenantContext(db, tenantA.id, user2.id, async (tx) => {
      return tx
        .update(journalEntries)
        .set({ content: 'hacked' })
        .where(
          and(
            eq(journalEntries.id, entry1Private.id),
            eq(journalEntries.userId, user2.id) // 明示的に自分の user_id でフィルタ
          )
        )
        .returning();
    });
    // user2 のエントリではないので 0 行
    expect(result).toHaveLength(0);
  });

  it('user2 cannot DELETE user1 entry', async () => {
    const result = await withTenantContext(db, tenantA.id, user2.id, async (tx) => {
      return tx
        .delete(journalEntries)
        .where(eq(journalEntries.id, entry1Private.id))
        .returning();
    });
    expect(result).toHaveLength(0);
  });

  it('user2 CAN see user1 public entry via public_read policy', async () => {
    const rows = await withTenantContext(db, tenantA.id, user2.id, async (tx) => {
      return tx.select().from(journalEntries).where(eq(journalEntries.id, entry1Public.id));
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('user1 公開');
  });

  it('user2 CANNOT see user1 private entry via direct id lookup', async () => {
    const rows = await withTenantContext(db, tenantA.id, user2.id, async (tx) => {
      return tx
        .select()
        .from(journalEntries)
        .where(eq(journalEntries.id, entry1Private.id));
    });
    expect(rows).toHaveLength(0);
  });

  it('user1 CAN update own private entry', async () => {
    const result = await withTenantContext(db, tenantA.id, user1.id, async (tx) => {
      return tx
        .update(journalEntries)
        .set({ content: 'self update' })
        .where(eq(journalEntries.id, entry1Private.id))
        .returning();
    });
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('self update');
  });
});
