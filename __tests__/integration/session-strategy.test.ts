// Step 16a Suite 7 + 7a: Database セッション戦略 + Tenant 作成時シード
// SP-07 の sessions テーブル動作と NFR-U02-03 のシード処理を検証
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import {
  startTestDb,
  stopTestDb,
  truncateAll,
  withSystemAdminContext,
  type TestDb,
} from './helpers/testDb';
import { seedTenant, seedUser } from './helpers/seed';
import { sessions, tenants, tags } from '@/db/schema';
import { tagRepo, SYSTEM_DEFAULT_TAGS } from '@/features/journal/lib/tagRepository';

describe('Suite 7: Database session strategy (SP-07)', () => {
  let db: TestDb;
  let tenantA: Awaited<ReturnType<typeof seedTenant>>;
  let user: Awaited<ReturnType<typeof seedUser>>;

  beforeAll(async () => {
    db = await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await truncateAll(db);
    tenantA = await seedTenant(db, '学校 A');
    user = await seedUser(db, tenantA.id);
  });

  it('INSERT session row and lookup by token returns the row', async () => {
    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 8 * 60 * 60 * 1000);

    await db.insert(sessions).values({
      sessionToken: token,
      userId: user.id,
      activeTenantId: tenantA.id,
      expires,
    });

    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionToken, token));

    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(user.id);
  });

  it('expired session is filtered when querying with expires > NOW()', async () => {
    const token = randomBytes(32).toString('hex');
    const past = new Date(Date.now() - 60 * 1000); // 1分前

    await db.insert(sessions).values({
      sessionToken: token,
      userId: user.id,
      activeTenantId: tenantA.id,
      expires: past,
    });

    const rows = await db.execute(sql`
      SELECT * FROM sessions
      WHERE session_token = ${token}
        AND expires > NOW()
    `);
    expect(rows.rowCount).toBe(0);
  });

  it('DELETE session row makes it un-findable (= immediate logout)', async () => {
    const token = randomBytes(32).toString('hex');
    await db.insert(sessions).values({
      sessionToken: token,
      userId: user.id,
      activeTenantId: tenantA.id,
      expires: new Date(Date.now() + 8 * 60 * 60 * 1000),
    });

    await db.delete(sessions).where(eq(sessions.sessionToken, token));

    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionToken, token));
    expect(rows).toHaveLength(0);
  });

  it('multiple sessions per user can coexist (multi-device login)', async () => {
    const token1 = randomBytes(32).toString('hex');
    const token2 = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 8 * 60 * 60 * 1000);

    await db.insert(sessions).values([
      { sessionToken: token1, userId: user.id, activeTenantId: tenantA.id, expires },
      { sessionToken: token2, userId: user.id, activeTenantId: tenantA.id, expires },
    ]);

    const rows = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(rows).toHaveLength(2);
  });

  it('DELETE FROM sessions WHERE user_id removes all (force logout pattern)', async () => {
    const expires = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await db.insert(sessions).values([
      { sessionToken: randomBytes(32).toString('hex'), userId: user.id, activeTenantId: tenantA.id, expires },
      { sessionToken: randomBytes(32).toString('hex'), userId: user.id, activeTenantId: tenantA.id, expires },
      { sessionToken: randomBytes(32).toString('hex'), userId: user.id, activeTenantId: tenantA.id, expires },
    ]);

    await db.delete(sessions).where(eq(sessions.userId, user.id));

    const rows = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(rows).toHaveLength(0);
  });

  it('CASCADE delete: removing user removes all their sessions', async () => {
    const expires = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await db.insert(sessions).values({
      sessionToken: randomBytes(32).toString('hex'),
      userId: user.id,
      activeTenantId: tenantA.id,
      expires,
    });

    // user_tenant_roles も users 経由で CASCADE される
    await db.execute(sql`DELETE FROM users WHERE id = ${user.id}`);

    const rows = await db.select().from(sessions);
    expect(rows).toHaveLength(0);
  });
});

describe('Suite 7a: Tenant creation seeds default tags (NFR-U02-03)', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await truncateAll(db);
  });

  it('seedSystemDefaults inserts exactly 23 tags', async () => {
    const tenant = await seedTenant(db, '新規学校');

    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenant.id}, true)`);
      await tx.execute(sql`SELECT set_config('app.user_id', '00000000-0000-0000-0000-000000000000', true)`);
      await tx.execute(sql`SELECT set_config('app.role', 'system_admin', true)`);
      await tagRepo.seedSystemDefaults(tx as never, tenant.id);
    });

    const seeded = await withSystemAdminContext(db, '00000000-0000-0000-0000-000000000000', async (tx) => {
      return tx.select().from(tags).where(eq(tags.tenantId, tenant.id));
    });
    expect(seeded).toHaveLength(23);
  });

  it('seeded tags have isSystemDefault=true and createdBy=null', async () => {
    const tenant = await seedTenant(db, '学校');
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenant.id}, true)`);
      await tx.execute(sql`SELECT set_config('app.user_id', '00000000-0000-0000-0000-000000000000', true)`);
      await tx.execute(sql`SELECT set_config('app.role', 'system_admin', true)`);
      await tagRepo.seedSystemDefaults(tx as never, tenant.id);
    });

    const seeded = await db.select().from(tags).where(eq(tags.tenantId, tenant.id));
    seeded.forEach((t) => {
      expect(t.isSystemDefault).toBe(true);
      expect(t.createdBy).toBeNull();
    });
  });

  it('seeded tags have 15 emotion + 8 context split', async () => {
    const tenant = await seedTenant(db, '学校');
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenant.id}, true)`);
      await tx.execute(sql`SELECT set_config('app.user_id', '00000000-0000-0000-0000-000000000000', true)`);
      await tx.execute(sql`SELECT set_config('app.role', 'system_admin', true)`);
      await tagRepo.seedSystemDefaults(tx as never, tenant.id);
    });

    const seeded = await withSystemAdminContext(db, '00000000-0000-0000-0000-000000000000', async (tx) => {
      return tx.select().from(tags).where(eq(tags.tenantId, tenant.id));
    });
    const emotions = seeded.filter((t) => t.type === 'emotion');
    const tasks = seeded.filter((t) => t.type === 'context');
    expect(emotions).toHaveLength(15);
    expect(tasks).toHaveLength(8);
  });

  it('seeded tag names match SYSTEM_DEFAULT_TAGS constant', async () => {
    const tenant = await seedTenant(db, '学校');
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenant.id}, true)`);
      await tx.execute(sql`SELECT set_config('app.user_id', '00000000-0000-0000-0000-000000000000', true)`);
      await tx.execute(sql`SELECT set_config('app.role', 'system_admin', true)`);
      await tagRepo.seedSystemDefaults(tx as never, tenant.id);
    });

    const seeded = await withSystemAdminContext(db, '00000000-0000-0000-0000-000000000000', async (tx) => {
      return tx.select().from(tags).where(eq(tags.tenantId, tenant.id));
    });
    const names = seeded.map((t) => t.name).sort();
    const expected = SYSTEM_DEFAULT_TAGS.map((t) => t.name).sort();
    expect(names).toEqual(expected);
  });

  it('atomicity: if tenant insert succeeds but seed fails, both rollback', async () => {
    // 意図的に失敗を発生させる: 既存タグ名と同じ名前で重複作成
    const tenant = await seedTenant(db, '学校');

    // 先に "喜び" を手動で挿入しておく → seed が UNIQUE 制約違反でエラー
    // (v2 default tags に存在する名前を使うこと。v1 の "うれしい" は刷新で消えた)
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenant.id}, true)`);
      await tx.execute(sql`SELECT set_config('app.user_id', '00000000-0000-0000-0000-000000000000', true)`);
      await tx.execute(sql`SELECT set_config('app.role', 'system_admin', true)`);
      await tx.insert(tags).values({
        tenantId: tenant.id,
        name: '喜び',
        type: 'emotion',
        category: 'positive',
        isSystemDefault: false,
        sortOrder: 0,
      });
    });

    // 次にトランザクション内でテナント作成 + seed を試みる
    let failed = false;
    try {
      await db.transaction(async (tx) => {
        const [t] = await tx.insert(tenants).values({ name: '失敗', slug: `fail-${Date.now()}` }).returning();
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenant.id}, true)`);
        await tx.execute(sql`SELECT set_config('app.user_id', '00000000-0000-0000-0000-000000000000', true)`);
        await tx.execute(sql`SELECT set_config('app.role', 'system_admin', true)`);
        await tagRepo.seedSystemDefaults(tx as never, tenant.id);
      });
    } catch {
      failed = true;
    }

    expect(failed).toBe(true);
    // ロールバックされて新テナントが作られていない
    const fakeTenants = await db
      .select()
      .from(tenants)
      .where(eq(tenants.name, '失敗'));
    expect(fakeTenants).toHaveLength(0);
  });

  it('subsequent SELECT can read seeded tags via RLS', async () => {
    const tenant = await seedTenant(db, '学校');
    const adminUser = await seedUser(db, tenant.id, 'school_admin');
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenant.id}, true)`);
      await tx.execute(sql`SELECT set_config('app.user_id', ${adminUser.id}, true)`);
      await tx.execute(sql`SELECT set_config('app.role', 'system_admin', true)`);
      await tagRepo.seedSystemDefaults(tx as never, tenant.id);
    });

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenant.id}, true)`);
      await tx.execute(sql`SELECT set_config('app.user_id', ${adminUser.id}, true)`);
      await tx.execute(sql`SELECT set_config('app.role', 'school_admin', true)`);
      return tx.select().from(tags);
    });
    expect(rows).toHaveLength(23);
  });
});
