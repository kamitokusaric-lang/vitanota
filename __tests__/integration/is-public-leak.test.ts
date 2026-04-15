// Step 16a Suite 5: is_public 漏えい防止 (SP-U02-04 8 層防御の生存確認)
// VIEW・RLS・複合 FK の連携を実 PostgreSQL で検証
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, and } from 'drizzle-orm';
import {
  startTestDb,
  stopTestDb,
  truncateAll,
  withTenantContext,
  rawQuery,
  type TestDb,
} from './helpers/testDb';
import { seedTenant, seedUser, seedEntry } from './helpers/seed';
import { journalEntries, publicJournalEntries } from '@/db/schema';

describe('Suite 5: is_public leak prevention (SP-U02-04)', () => {
  let db: TestDb;
  let tenantA: Awaited<ReturnType<typeof seedTenant>>;
  let userA: Awaited<ReturnType<typeof seedUser>>;
  let userA2: Awaited<ReturnType<typeof seedUser>>;

  beforeAll(async () => {
    db = await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await truncateAll(db);
    tenantA = await seedTenant(db, '学校 A');
    userA = await seedUser(db, tenantA.id, 'teacher', 'a@test.example.com');
    userA2 = await seedUser(db, tenantA.id, 'teacher', 'a2@test.example.com');
  });

  it('Layer 4 VIEW: public_journal_entries does NOT expose is_public column', async () => {
    // information_schema で VIEW のカラム一覧を確認
    const columns = await rawQuery<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'public_journal_entries'`
    );
    const names = columns.map((c) => c.column_name);
    expect(names).not.toContain('is_public');
    expect(names).toContain('id');
    expect(names).toContain('tenant_id');
    expect(names).toContain('user_id');
    expect(names).toContain('content');
  });

  it('Layer 4 VIEW: WHERE is_public=true is enforced in VIEW definition', async () => {
    await seedEntry(db, { tenantId: tenantA.id, userId: userA.id, content: 'pub-1', isPublic: true });
    await seedEntry(db, { tenantId: tenantA.id, userId: userA.id, content: 'priv-1', isPublic: false });
    await seedEntry(db, { tenantId: tenantA.id, userId: userA.id, content: 'pub-2', isPublic: true });

    const rows = await withTenantContext(db, tenantA.id, userA.id, async (tx) => {
      return tx.select().from(publicJournalEntries);
    });

    expect(rows).toHaveLength(2);
    rows.forEach((r) => {
      // is_public 列が含まれない (Layer 4)
      expect(r).not.toHaveProperty('isPublic');
    });
  });

  it('Layer 5 RLS: another user in same tenant can see public but NOT private entries', async () => {
    await seedEntry(db, { tenantId: tenantA.id, userId: userA.id, content: 'A の公開', isPublic: true });
    await seedEntry(db, { tenantId: tenantA.id, userId: userA.id, content: 'A の非公開', isPublic: false });

    // userA2 が userA のエントリを SELECT
    const rows = await withTenantContext(db, tenantA.id, userA2.id, async (tx) => {
      return tx.select().from(journalEntries);
    });

    // public_read で is_public=true のみ見える、owner_all で userA2 自身のは無し
    expect(rows.every((r) => r.isPublic === true)).toBe(true);
    expect(rows.find((r) => r.content === 'A の非公開')).toBeUndefined();
  });

  it('Layer 5+6 RLS+VIEW: user accessing VIEW cannot see other users private entries', async () => {
    await seedEntry(db, { tenantId: tenantA.id, userId: userA.id, content: 'A pub', isPublic: true });
    await seedEntry(db, { tenantId: tenantA.id, userId: userA.id, content: 'A priv', isPublic: false });

    const rows = await withTenantContext(db, tenantA.id, userA2.id, async (tx) => {
      return tx.select().from(publicJournalEntries);
    });

    // VIEW + RLS のダブル: public 1 件のみ
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('A pub');
  });

  it('fuzzing: 100 private + 5 public entries → only 5 visible via VIEW', async () => {
    for (let i = 0; i < 100; i++) {
      await seedEntry(db, {
        tenantId: tenantA.id,
        userId: userA.id,
        content: `private ${i}`,
        isPublic: false,
      });
    }
    for (let i = 0; i < 5; i++) {
      await seedEntry(db, {
        tenantId: tenantA.id,
        userId: userA.id,
        content: `public ${i}`,
        isPublic: true,
      });
    }

    // 別ユーザー視点で VIEW を SELECT (owner_all マッチを除外)
    const rows = await withTenantContext(db, tenantA.id, userA2.id, async (tx) => {
      return tx.select().from(publicJournalEntries);
    });

    expect(rows).toHaveLength(5);
    rows.forEach((r) => {
      expect(r.content).toMatch(/^public/);
    });
  });

  it('owner viewing VIEW also gets only public (VIEW WHERE 句が常に true)', async () => {
    // owner 自身でも VIEW 経由なら is_public=true のみ
    await seedEntry(db, { tenantId: tenantA.id, userId: userA.id, content: 'mine pub', isPublic: true });
    await seedEntry(db, { tenantId: tenantA.id, userId: userA.id, content: 'mine priv', isPublic: false });

    const rows = await withTenantContext(db, tenantA.id, userA.id, async (tx) => {
      return tx.select().from(publicJournalEntries);
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('mine pub');
  });
});
