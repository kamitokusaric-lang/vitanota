// タスクカテゴリマスタ Repository
import { asc, eq } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import { taskCategories } from '@/db/schema';
import type * as schema from '@/db/schema';
import type { TaskCategory } from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

// migration 0024 と同一のシステムデフォルト 9 カテゴリ
// 新規テナント作成時に POST /api/system/tenants から seed される
export const SYSTEM_DEFAULT_TASK_CATEGORIES = [
  { name: '教務',         sortOrder: 1 },
  { name: '生徒指導',     sortOrder: 2 },
  { name: '進路指導',     sortOrder: 3 },
  { name: '学級運営',     sortOrder: 4 },
  { name: '特別活動',     sortOrder: 5 },
  { name: '保健安全指導', sortOrder: 6 },
  { name: '学校運営',     sortOrder: 7 },
  { name: '渉外',         sortOrder: 8 },
  { name: '雑務',         sortOrder: 9 },
] as const;

export class TaskCategoryRepository {
  async findAllByTenant(
    tx: DrizzleDb,
    tenantId: string,
  ): Promise<TaskCategory[]> {
    return tx
      .select()
      .from(taskCategories)
      .where(eq(taskCategories.tenantId, tenantId))
      .orderBy(asc(taskCategories.sortOrder), asc(taskCategories.name));
  }

  async findById(
    tx: DrizzleDb,
    id: string,
    tenantId: string,
  ): Promise<TaskCategory | null> {
    const [row] = await tx
      .select()
      .from(taskCategories)
      .where(eq(taskCategories.id, id))
      .limit(1);
    if (!row || row.tenantId !== tenantId) return null;
    return row;
  }

  /**
   * テナント作成時にシステムデフォルト 9 カテゴリを冪等 INSERT
   * (tenant_id, name) UNIQUE で再実行 safe
   */
  async seedSystemDefaults(
    tx: DrizzleDb,
    tenantId: string,
  ): Promise<TaskCategory[]> {
    const created = await tx
      .insert(taskCategories)
      .values(
        SYSTEM_DEFAULT_TASK_CATEGORIES.map((c) => ({
          tenantId,
          name: c.name,
          isSystemDefault: true,
          sortOrder: c.sortOrder,
        })),
      )
      .onConflictDoNothing({
        target: [taskCategories.tenantId, taskCategories.name],
      })
      .returning();
    return created;
  }
}

export const taskCategoryRepo = new TaskCategoryRepository();
