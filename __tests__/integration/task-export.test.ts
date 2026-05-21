// system_admin 用 task CSV エクスポートの回帰防止テスト。
// task には本人限定の可視ステータスがないため、テナント分離と期間境界を中心に担保する。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  startTestDb,
  stopTestDb,
  truncateAll,
  withSystemAdminContext,
  rawQueryAsSuperuser,
  type TestDb,
} from './helpers/testDb';
import { seedTenant, seedUser } from './helpers/seed';
import { selectTaskExportRows } from '@/features/system/lib/taskExportQuery';

const SYSTEM_ADMIN_USER_ID = '00000000-0000-0000-0000-000000000099';
const WINDOW_FROM = '2026-05-07';
const WINDOW_TO = '2026-05-21';

async function seedCategory(
  db: TestDb,
  args: { tenantId: string; userId: string; name: string },
): Promise<string> {
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.role', 'system_admin', true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${args.userId}, true)`);
    return tx.execute(sql`
      INSERT INTO task_categories (tenant_id, name, is_system_default, sort_order, created_by)
      VALUES (${args.tenantId}::uuid, ${args.name}, false, 0, ${args.userId}::uuid)
      RETURNING id::text AS id
    `);
  });
  return (result.rows[0] as { id: string }).id;
}

interface SeededTask {
  id: string;
  title: string;
}

async function seedTask(
  db: TestDb,
  args: {
    tenantId: string;
    userId: string;
    categoryId: string;
    title: string;
    createdAt?: string;
    assigneeIds?: string[];
  },
): Promise<SeededTask> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${args.tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${args.userId}, true)`);
    await tx.execute(sql`SELECT set_config('app.role', 'teacher', true)`);
    const result = await tx.execute(sql`
      INSERT INTO tasks (tenant_id, category_id, created_by, title)
      VALUES (${args.tenantId}::uuid, ${args.categoryId}::uuid, ${args.userId}::uuid, ${args.title})
      RETURNING id::text AS id
    `);
    const id = (result.rows[0] as { id: string }).id;
    for (const assigneeId of args.assigneeIds ?? []) {
      await tx.execute(sql`
        INSERT INTO task_assignees (task_id, user_id, tenant_id)
        VALUES (${id}::uuid, ${assigneeId}::uuid, ${args.tenantId}::uuid)
      `);
    }
    return { id, title: args.title };
  });
}

async function setTaskCreatedAt(taskId: string, createdAt: string): Promise<void> {
  await rawQueryAsSuperuser(
    `UPDATE tasks SET created_at = $1, updated_at = $1 WHERE id = $2`,
    [createdAt, taskId],
  );
}

describe('task-export integration', () => {
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

  it('別テナントのタスクは混ざらない', async () => {
    const tenantA = await seedTenant(db, '学校 A');
    const tenantB = await seedTenant(db, '学校 B');
    const userA = await seedUser(db, tenantA.id, 'teacher', 'a@test.example.com');
    const userB = await seedUser(db, tenantB.id, 'teacher', 'b@test.example.com');
    const catA = await seedCategory(db, {
      tenantId: tenantA.id,
      userId: userA.id,
      name: 'A の業務',
    });
    const catB = await seedCategory(db, {
      tenantId: tenantB.id,
      userId: userB.id,
      name: 'B の業務',
    });

    const aTask = await seedTask(db, {
      tenantId: tenantA.id,
      userId: userA.id,
      categoryId: catA,
      title: 'A のタスク',
    });
    const bTask = await seedTask(db, {
      tenantId: tenantB.id,
      userId: userB.id,
      categoryId: catB,
      title: 'B のタスク',
    });
    await setTaskCreatedAt(aTask.id, '2026-05-14T10:00:00+09:00');
    await setTaskCreatedAt(bTask.id, '2026-05-14T10:00:00+09:00');

    const rows = await withSystemAdminContext(db, SYSTEM_ADMIN_USER_ID, async (tx) => {
      return selectTaskExportRows(tx as unknown as Parameters<typeof selectTaskExportRows>[0], {
        tenantId: tenantA.id,
        from: WINDOW_FROM,
        to: WINDOW_TO,
      });
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(aTask.id);
    expect(rows[0].title).toBe('A のタスク');
    expect(rows[0].category_name).toBe('A の業務');
  });

  it('期間外は除外、境界日は包含される', async () => {
    const tenant = await seedTenant(db, '学校 A');
    const user = await seedUser(db, tenant.id, 'teacher', 'a@test.example.com');
    const cat = await seedCategory(db, {
      tenantId: tenant.id,
      userId: user.id,
      name: '業務',
    });

    const tBefore = await seedTask(db, {
      tenantId: tenant.id,
      userId: user.id,
      categoryId: cat,
      title: '期間前',
    });
    const tFrom = await seedTask(db, {
      tenantId: tenant.id,
      userId: user.id,
      categoryId: cat,
      title: '開始日',
    });
    const tTo = await seedTask(db, {
      tenantId: tenant.id,
      userId: user.id,
      categoryId: cat,
      title: '終了日',
    });
    const tAfter = await seedTask(db, {
      tenantId: tenant.id,
      userId: user.id,
      categoryId: cat,
      title: '期間後',
    });

    await setTaskCreatedAt(tBefore.id, '2026-05-06T23:59:00+09:00');
    await setTaskCreatedAt(tFrom.id, '2026-05-07T00:00:00+09:00');
    await setTaskCreatedAt(tTo.id, '2026-05-21T23:59:00+09:00');
    await setTaskCreatedAt(tAfter.id, '2026-05-22T00:00:00+09:00');

    const rows = await withSystemAdminContext(db, SYSTEM_ADMIN_USER_ID, async (tx) => {
      return selectTaskExportRows(tx as unknown as Parameters<typeof selectTaskExportRows>[0], {
        tenantId: tenant.id,
        from: WINDOW_FROM,
        to: WINDOW_TO,
      });
    });

    const titles = rows.map((r) => r.title);
    expect(titles).toContain('開始日');
    expect(titles).toContain('終了日');
    expect(titles).not.toContain('期間前');
    expect(titles).not.toContain('期間後');
  });

  it('assignees は user_id を ; 区切りで集約', async () => {
    const tenant = await seedTenant(db, '学校 A');
    const user1 = await seedUser(db, tenant.id, 'teacher', 'a1@test.example.com');
    const user2 = await seedUser(db, tenant.id, 'teacher', 'a2@test.example.com');
    const cat = await seedCategory(db, {
      tenantId: tenant.id,
      userId: user1.id,
      name: '業務',
    });

    const task = await seedTask(db, {
      tenantId: tenant.id,
      userId: user1.id,
      categoryId: cat,
      title: '複数担当',
      assigneeIds: [user1.id, user2.id],
    });
    await setTaskCreatedAt(task.id, '2026-05-14T10:00:00+09:00');

    const rows = await withSystemAdminContext(db, SYSTEM_ADMIN_USER_ID, async (tx) => {
      return selectTaskExportRows(tx as unknown as Parameters<typeof selectTaskExportRows>[0], {
        tenantId: tenant.id,
        from: WINDOW_FROM,
        to: WINDOW_TO,
      });
    });

    expect(rows).toHaveLength(1);
    const expected = [user1.id, user2.id].sort().join(';');
    expect(rows[0].assignees).toBe(expected);
  });
});
