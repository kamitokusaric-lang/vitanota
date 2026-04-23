// タスクカテゴリマスタ Repository
import { asc, eq } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import { taskCategories } from '@/db/schema';
import type * as schema from '@/db/schema';
import type { TaskCategory } from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

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
}

export const taskCategoryRepo = new TaskCategoryRepository();
