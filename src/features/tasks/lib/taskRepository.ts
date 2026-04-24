// タスク Repository: tasks テーブルへの CRUD
// RLS で tenant 内 SELECT 全員 / INSERT・UPDATE・DELETE は owner or school_admin
import { and, asc, desc, eq, or, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import { tasks, users, userTenantProfiles } from '@/db/schema';
import type * as schema from '@/db/schema';
import type { Task } from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export interface TaskContext {
  userId: string;
  tenantId: string;
}

export interface CreateTaskParams {
  categoryId: string;
  ownerUserId: string;
  createdBy: string;
  title: string;
  description?: string;
  dueDate?: Date;
}

export interface UpdateTaskParams {
  categoryId?: string;
  title?: string;
  description?: string | null;
  dueDate?: Date | null;
  status?: 'todo' | 'in_progress' | 'done';
}

export type TaskWithOwner = Task & {
  ownerName: string | null;
  ownerNickname: string | null;
  commentCount: number;
};

export class TaskRepository {
  async findAllByTenant(
    tx: DrizzleDb,
    ctx: TaskContext,
    filters?: { ownerUserId?: string; scope?: 'mine' },
  ): Promise<TaskWithOwner[]> {
    const conditions = [eq(tasks.tenantId, ctx.tenantId)];
    if (filters?.scope === 'mine') {
      // 自分が owner または createdBy (マイボード: アサイン元も含む)
      const scopeCondition = or(
        eq(tasks.ownerUserId, ctx.userId),
        eq(tasks.createdBy, ctx.userId),
      );
      if (scopeCondition) conditions.push(scopeCondition);
    } else if (filters?.ownerUserId) {
      conditions.push(eq(tasks.ownerUserId, filters.ownerUserId));
    }

    const rows = await tx
      .select({
        id: tasks.id,
        tenantId: tasks.tenantId,
        categoryId: tasks.categoryId,
        ownerUserId: tasks.ownerUserId,
        createdBy: tasks.createdBy,
        title: tasks.title,
        description: tasks.description,
        dueDate: tasks.dueDate,
        status: tasks.status,
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
        ownerName: users.name,
        ownerNickname: userTenantProfiles.nickname,
        commentCount: sql<number>`(SELECT COUNT(*)::int FROM task_comments WHERE task_comments.task_id = ${tasks.id})`,
      })
      .from(tasks)
      .innerJoin(users, eq(users.id, tasks.ownerUserId))
      .leftJoin(
        userTenantProfiles,
        and(
          eq(userTenantProfiles.userId, tasks.ownerUserId),
          eq(userTenantProfiles.tenantId, tasks.tenantId),
        ),
      )
      .where(and(...conditions))
      // 期限降順で下に (期限なしは最後)、同期限は作成順
      .orderBy(asc(tasks.dueDate), desc(tasks.createdAt));
    return rows;
  }

  async findById(
    tx: DrizzleDb,
    id: string,
    ctx: TaskContext,
  ): Promise<Task | null> {
    const [row] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, ctx.tenantId)))
      .limit(1);
    return row ?? null;
  }

  async create(
    tx: DrizzleDb,
    params: CreateTaskParams,
    ctx: TaskContext,
  ): Promise<Task> {
    const [row] = await tx
      .insert(tasks)
      .values({
        tenantId: ctx.tenantId,
        categoryId: params.categoryId,
        ownerUserId: params.ownerUserId,
        createdBy: params.createdBy,
        title: params.title,
        description: params.description,
        dueDate: params.dueDate,
      })
      .returning();
    return row;
  }

  async update(
    tx: DrizzleDb,
    id: string,
    params: UpdateTaskParams,
    ctx: TaskContext,
  ): Promise<Task | null> {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (params.categoryId !== undefined) updates.categoryId = params.categoryId;
    if (params.title !== undefined) updates.title = params.title;
    if (params.description !== undefined) updates.description = params.description;
    if (params.dueDate !== undefined) updates.dueDate = params.dueDate;
    if (params.status !== undefined) {
      updates.status = params.status;
      // DB CHECK 制約: status='done' のとき completedAt 必須
      updates.completedAt = params.status === 'done' ? new Date() : null;
    }

    const [row] = await tx
      .update(tasks)
      .set(updates)
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, ctx.tenantId)))
      .returning();
    return row ?? null;
  }

  async delete(
    tx: DrizzleDb,
    id: string,
    ctx: TaskContext,
  ): Promise<boolean> {
    const result = await tx
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, ctx.tenantId)))
      .returning({ id: tasks.id });
    return result.length > 0;
  }
}

export const taskRepo = new TaskRepository();
