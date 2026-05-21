// AI 風表示の判定ロジック (system_admin 兼任アカウントの投稿) の回帰防止。
//
// 構造: findTimeline は isAiPost=false 固定で返し、 fetchSystemAdminUserIds で
// 別 transaction (withSystemAdmin) で system_admin 集合を取って handler が enrich する。
// この test は両方を組み合わせて handler 等価のフローを検証する。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { sql, and, eq } from 'drizzle-orm';
import {
  startTestDb,
  stopTestDb,
  truncateAll,
  withTenantContext,
  withSystemAdminContext,
  type TestDb,
} from './helpers/testDb';
import { seedTenant, seedUser, seedEntry } from './helpers/seed';
import { publicTimelineRepo } from '@/features/journal/lib/publicTimelineRepository';
import { selectSystemAdminUserIds } from '@/features/journal/lib/aiAuthorLookup';
import { userTenantRoles } from '@/db/schema';

async function attachSystemAdmin(db: TestDb, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.role', 'system_admin', true)`);
    await tx.execute(
      sql`SELECT set_config('app.user_id', '00000000-0000-0000-0000-000000000099', true)`,
    );
    await tx.execute(sql`
      INSERT INTO user_tenant_roles (user_id, tenant_id, role)
      VALUES (${userId}::uuid, NULL, 'system_admin')
      ON CONFLICT DO NOTHING
    `);
  });
}

async function detachSystemAdmin(db: TestDb, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.role', 'system_admin', true)`);
    await tx.execute(
      sql`SELECT set_config('app.user_id', '00000000-0000-0000-0000-000000000099', true)`,
    );
    await tx
      .delete(userTenantRoles)
      .where(
        and(
          eq(userTenantRoles.userId, userId),
          eq(userTenantRoles.role, 'system_admin'),
        ),
      );
  });
}

async function timelineWithAiFlag(
  db: TestDb,
  ctx: { tenantId: string; userId: string },
) {
  // handler 等価フロー: findTimeline (teacher trx) + fetchSystemAdminUserIds (system_admin trx) → merge
  const entries = await withTenantContext(db, ctx.tenantId, ctx.userId, async (tx) => {
    return publicTimelineRepo.findTimeline(
      tx as unknown as Parameters<typeof publicTimelineRepo.findTimeline>[0],
      { limit: 50, offset: 0 },
      { tenantId: ctx.tenantId, userId: ctx.userId },
    );
  });
  const authorIds = Array.from(
    new Set(entries.map((e) => e.userId).filter((id): id is string => Boolean(id))),
  );
  // 統合テストでは withSystemAdminContext (テスト用 helper) で system_admin trx を開いて
  // selectSystemAdminUserIds を直接呼ぶ。 本番 handler は fetchSystemAdminUserIds (内部で
  // withSystemAdmin) を使うが、 中身のクエリは同じ。
  const aiSet = await withSystemAdminContext(
    db,
    '00000000-0000-0000-0000-000000000099',
    async (tx) =>
      selectSystemAdminUserIds(
        tx as unknown as Parameters<typeof selectSystemAdminUserIds>[0],
        authorIds,
      ),
  );
  return entries.map((e) => ({
    ...e,
    isAiPost: e.userId ? aiSet.has(e.userId) : false,
  }));
}

describe('public timeline AI post detection', () => {
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

  it('通常 teacher の投稿は isAiPost=false', async () => {
    const tenant = await seedTenant(db, '学校 A');
    const teacher = await seedUser(db, tenant.id, 'teacher', 't@test.example.com');
    const viewer = await seedUser(db, tenant.id, 'teacher', 'v@test.example.com');

    await seedEntry(db, {
      tenantId: tenant.id,
      userId: teacher.id,
      content: '通常 teacher の投稿',
      isPublic: true,
    });

    const entries = await timelineWithAiFlag(db, { tenantId: tenant.id, userId: viewer.id });
    expect(entries).toHaveLength(1);
    expect(entries[0].isAiPost).toBe(false);
  });

  it('school_admin だけ の user の投稿も isAiPost=false', async () => {
    const tenant = await seedTenant(db, '学校 A');
    const schoolAdmin = await seedUser(db, tenant.id, 'school_admin', 'sa@test.example.com');
    const viewer = await seedUser(db, tenant.id, 'teacher', 'v@test.example.com');

    await seedEntry(db, {
      tenantId: tenant.id,
      userId: schoolAdmin.id,
      content: 'school_admin の投稿',
      isPublic: true,
    });

    const entries = await timelineWithAiFlag(db, { tenantId: tenant.id, userId: viewer.id });
    expect(entries).toHaveLength(1);
    expect(entries[0].isAiPost).toBe(false);
  });

  it('system_admin 兼 school_admin の投稿は isAiPost=true', async () => {
    const tenant = await seedTenant(db, '学校 A');
    const aiUser = await seedUser(db, tenant.id, 'school_admin', 'ai@test.example.com');
    await attachSystemAdmin(db, aiUser.id);
    const viewer = await seedUser(db, tenant.id, 'teacher', 'v@test.example.com');

    await seedEntry(db, {
      tenantId: tenant.id,
      userId: aiUser.id,
      content: 'AI 週次日誌 β',
      isPublic: true,
    });

    const entries = await timelineWithAiFlag(db, { tenantId: tenant.id, userId: viewer.id });
    expect(entries).toHaveLength(1);
    expect(entries[0].isAiPost).toBe(true);
    expect(entries[0].content).toBe('AI 週次日誌 β');
  });

  it('system_admin ロールを外すと同じ投稿が isAiPost=false に切り替わる (現時点判定)', async () => {
    const tenant = await seedTenant(db, '学校 A');
    const aiUser = await seedUser(db, tenant.id, 'school_admin', 'ai@test.example.com');
    await attachSystemAdmin(db, aiUser.id);
    const viewer = await seedUser(db, tenant.id, 'teacher', 'v@test.example.com');

    await seedEntry(db, {
      tenantId: tenant.id,
      userId: aiUser.id,
      content: '投稿',
      isPublic: true,
    });

    await detachSystemAdmin(db, aiUser.id);

    const entries = await timelineWithAiFlag(db, { tenantId: tenant.id, userId: viewer.id });
    expect(entries).toHaveLength(1);
    expect(entries[0].isAiPost).toBe(false);
  });

  it('混在: 通常投稿と AI 投稿が同テナント内で正しく区別される', async () => {
    const tenant = await seedTenant(db, '学校 A');
    const teacher = await seedUser(db, tenant.id, 'teacher', 't@test.example.com');
    const aiUser = await seedUser(db, tenant.id, 'school_admin', 'ai@test.example.com');
    await attachSystemAdmin(db, aiUser.id);
    const viewer = await seedUser(db, tenant.id, 'teacher', 'v@test.example.com');

    const normal = await seedEntry(db, {
      tenantId: tenant.id,
      userId: teacher.id,
      content: '教員の通常投稿',
      isPublic: true,
    });
    const ai = await seedEntry(db, {
      tenantId: tenant.id,
      userId: aiUser.id,
      content: 'AI 週次日誌 β',
      isPublic: true,
    });

    const entries = await timelineWithAiFlag(db, { tenantId: tenant.id, userId: viewer.id });
    expect(entries).toHaveLength(2);
    const normalRow = entries.find((e) => e.id === normal.id);
    const aiRow = entries.find((e) => e.id === ai.id);
    expect(normalRow?.isAiPost).toBe(false);
    expect(aiRow?.isAiPost).toBe(true);
  });
});
