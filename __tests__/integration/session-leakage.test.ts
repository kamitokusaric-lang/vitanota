// Step 16a Suite 3 + 4: Session variable leakage + RLS fail-safe
// 論点 H + R1 (RDS Proxy ピンニング) のブラウザ層・API 層を経由しない直接検証
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
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

describe('Suite 3: Session variable leakage (論点 H・R1)', () => {
  let db: TestDb;
  let tenantA: Awaited<ReturnType<typeof seedTenant>>;
  let tenantB: Awaited<ReturnType<typeof seedTenant>>;
  let userA: Awaited<ReturnType<typeof seedUser>>;
  let userB: Awaited<ReturnType<typeof seedUser>>;

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
    await seedEntry(db, { tenantId: tenantA.id, userId: userA.id, isPublic: true });
    await seedEntry(db, { tenantId: tenantB.id, userId: userB.id, isPublic: true });
  });

  it('after tenantA transaction ends, current_setting is reset (SET LOCAL behavior)', async () => {
    // tenantA でトランザクション
    await withTenantContext(db, tenantA.id, userA.id, async (tx) => {
      await tx.select().from(journalEntries);
    });

    // トランザクション終了後、別の接続で current_setting を確認
    // (注: SET LOCAL は transaction-scoped なので、新しい接続/transaction では NULL)
    const setting = await rawQuery<{ setting: string | null }>(
      `SELECT current_setting('app.tenant_id', true) as setting`
    );
    // current_setting with missing_ok=true returns null or '' depending on PG version/state
    expect(setting[0].setting === null || setting[0].setting === '').toBe(true);
  });

  it('raw query without SET LOCAL returns zero rows from public_journal_entries (fail-safe)', async () => {
    // app.tenant_id を一切設定せずに VIEW を叩く
    const rows = await rawQuery<{ id: string }>(
      `SELECT id FROM public_journal_entries`
    );
    expect(rows).toHaveLength(0);
  });

  it('raw query without SET LOCAL returns zero rows from journal_entries', async () => {
    const rows = await rawQuery<{ id: string }>(
      `SELECT id FROM journal_entries`
    );
    expect(rows).toHaveLength(0);
  });

  it('two concurrent transactions with different tenants do not cross-contaminate', async () => {
    const [rowsA, rowsB] = await Promise.all([
      withTenantContext(db, tenantA.id, userA.id, async (tx) => {
        return tx.select().from(journalEntries);
      }),
      withTenantContext(db, tenantB.id, userB.id, async (tx) => {
        return tx.select().from(journalEntries);
      }),
    ]);

    expect(rowsA.every((r) => r.tenantId === tenantA.id)).toBe(true);
    expect(rowsB.every((r) => r.tenantId === tenantB.id)).toBe(true);
    expect(rowsA.length).toBeGreaterThan(0);
    expect(rowsB.length).toBeGreaterThan(0);
  });

  it('20 concurrent random tenant queries maintain perfect isolation', async () => {
    const tenants = [
      { tenant: tenantA, user: userA },
      { tenant: tenantB, user: userB },
    ];

    const results = await Promise.all(
      Array.from({ length: 20 }, async (_, i) => {
        const { tenant, user } = tenants[i % 2];
        const rows = await withTenantContext(db, tenant.id, user.id, async (tx) => {
          return tx.select().from(journalEntries);
        });
        return { expected: tenant.id, actual: rows.map((r) => r.tenantId) };
      })
    );

    results.forEach(({ expected, actual }) => {
      expect(actual.every((id) => id === expected)).toBe(true);
    });
  });
});

describe('Suite 4: RLS fail-safe', () => {
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
    userA = await seedUser(db, tenantA.id);
    await seedEntry(db, { tenantId: tenantA.id, userId: userA.id, isPublic: true });
    await seedEntry(db, { tenantId: tenantA.id, userId: userA.id, isPublic: false });
  });

  it('query without app.tenant_id setting returns zero rows', async () => {
    const rows = await rawQuery(`SELECT * FROM journal_entries`);
    expect(rows).toHaveLength(0);
  });

  it('VIEW access without context returns zero rows', async () => {
    const rows = await rawQuery(`SELECT * FROM public_journal_entries`);
    expect(rows).toHaveLength(0);
  });

  it('tags table also returns zero without context', async () => {
    const rows = await rawQuery(`SELECT * FROM tags`);
    expect(rows).toHaveLength(0);
  });

  it('within tx, setting app.tenant_id without app.role returns zero rows (CASE fail-safe)', async () => {
    // CASE 式で app_role() IS NULL → false。app.role 未設定は全拒否
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantA.id}, true)`);
      return tx.select().from(publicJournalEntries);
    });
    expect(rows).toHaveLength(0);
  });

  it('within tx, setting app.tenant_id + app.role but no user_id allows public_read only', async () => {
    // teacher ロールで tenant_id のみ設定。public_read ポリシーは tenant_id のみ必要
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantA.id}, true)`);
      await tx.execute(sql`SELECT set_config('app.role', 'teacher', true)`);
      return tx.select().from(publicJournalEntries);
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenantId === tenantA.id)).toBe(true);
  });
});
