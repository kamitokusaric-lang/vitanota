// タスク Repository: tasks テーブルへの CRUD と task_assignees (M:N) の管理
// RLS で tenant 内 SELECT 全員 / UPDATE・DELETE は assignee or createdBy or school_admin
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import {
  tasks,
  taskAssignees,
  users,
  userTenantProfiles,
  taskTags,
  taskTagAssignments,
} from '@/db/schema';
import type * as schema from '@/db/schema';
import type { Task } from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export interface TaskContext {
  userId: string;
  tenantId: string;
}

export interface CreateTaskParams {
  categoryId: string;
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
  status?: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
}

export interface TaskTagSummary {
  id: string;
  name: string;
}

export interface TaskAssigneeSummary {
  userId: string;
  name: string | null;
  nickname: string | null;
}

export type TaskWithAssignees = Task & {
  assignees: TaskAssigneeSummary[];
  commentCount: number;
  tags: TaskTagSummary[];
};

export class TaskRepository {
  async findAllByTenant(
    tx: DrizzleDb,
    ctx: TaskContext,
    filters?: { ownerUserId?: string; scope?: 'mine' },
  ): Promise<TaskWithAssignees[]> {
    const conditions = [eq(tasks.tenantId, ctx.tenantId)];
    if (filters?.scope === 'mine') {
      // 自分が assignee に含まれる または createdBy=self (依頼中も拾うため)
      const myAssignedTaskIds = tx
        .select({ id: taskAssignees.taskId })
        .from(taskAssignees)
        .where(
          and(
            eq(taskAssignees.userId, ctx.userId),
            eq(taskAssignees.tenantId, ctx.tenantId),
          ),
        );
      const scopeCondition = or(
        inArray(tasks.id, myAssignedTaskIds),
        eq(tasks.createdBy, ctx.userId),
      );
      if (scopeCondition) conditions.push(scopeCondition);
    } else if (filters?.ownerUserId) {
      // 旧 ownerUserId フィルタ: 指定 user が assignees に含まれるタスクに変更
      const filterAssignedTaskIds = tx
        .select({ id: taskAssignees.taskId })
        .from(taskAssignees)
        .where(
          and(
            eq(taskAssignees.userId, filters.ownerUserId),
            eq(taskAssignees.tenantId, ctx.tenantId),
          ),
        );
      conditions.push(inArray(tasks.id, filterAssignedTaskIds));
    }

    const rows = await tx
      .select({
        id: tasks.id,
        tenantId: tasks.tenantId,
        categoryId: tasks.categoryId,
        createdBy: tasks.createdBy,
        title: tasks.title,
        description: tasks.description,
        dueDate: tasks.dueDate,
        status: tasks.status,
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
        commentCount: sql<number>`(SELECT COUNT(*)::int FROM task_comments WHERE task_comments.task_id = ${tasks.id})`,
      })
      .from(tasks)
      .where(and(...conditions))
      // 期限降順で下に (期限なしは最後)、同期限は作成順
      .orderBy(asc(tasks.dueDate), desc(tasks.createdAt));

    if (rows.length === 0) return [];

    const taskIds = rows.map((r) => r.id);
    const [assigneeRows, tagAssignments] = await Promise.all([
      this.findAssigneesByTaskIds(tx, taskIds, ctx),
      this.findTagsByTaskIds(tx, taskIds, ctx),
    ]);

    const assigneesMap = new Map<string, TaskAssigneeSummary[]>();
    for (const a of assigneeRows) {
      const arr = assigneesMap.get(a.taskId) ?? [];
      arr.push({ userId: a.userId, name: a.name, nickname: a.nickname });
      assigneesMap.set(a.taskId, arr);
    }

    const tagsMap = new Map<string, TaskTagSummary[]>();
    for (const ta of tagAssignments) {
      const arr = tagsMap.get(ta.taskId) ?? [];
      arr.push({ id: ta.tagId, name: ta.tagName });
      tagsMap.set(ta.taskId, arr);
    }

    return rows.map((r) => ({
      ...r,
      assignees: assigneesMap.get(r.id) ?? [],
      tags: tagsMap.get(r.id) ?? [],
    }));
  }

  async findAssigneesByTaskIds(
    tx: DrizzleDb,
    taskIds: string[],
    ctx: TaskContext,
  ): Promise<
    Array<{ taskId: string; userId: string; name: string | null; nickname: string | null }>
  > {
    if (taskIds.length === 0) return [];
    const rows = await tx
      .select({
        taskId: taskAssignees.taskId,
        userId: users.id,
        name: users.name,
        nickname: userTenantProfiles.nickname,
      })
      .from(taskAssignees)
      .innerJoin(users, eq(users.id, taskAssignees.userId))
      .leftJoin(
        userTenantProfiles,
        and(
          eq(userTenantProfiles.userId, taskAssignees.userId),
          eq(userTenantProfiles.tenantId, ctx.tenantId),
        ),
      )
      .where(
        and(
          eq(taskAssignees.tenantId, ctx.tenantId),
          inArray(taskAssignees.taskId, taskIds),
        ),
      )
      .orderBy(asc(users.name));
    return rows;
  }

  /**
   * タスクの assignee 割当を差分更新 (既存全削除 → 新規 INSERT)
   * - userIds は同テナント内の users.id を想定 (アプリ層で検証)
   * - tenant_id は denormalize で同梱 (RLS が WITH CHECK で確認)
   */
  async setAssigneesForTask(
    tx: DrizzleDb,
    taskId: string,
    userIds: string[],
    ctx: TaskContext,
  ): Promise<void> {
    await tx
      .delete(taskAssignees)
      .where(
        and(
          eq(taskAssignees.taskId, taskId),
          eq(taskAssignees.tenantId, ctx.tenantId),
        ),
      );
    if (userIds.length === 0) return;
    await tx.insert(taskAssignees).values(
      userIds.map((userId) => ({
        taskId,
        userId,
        tenantId: ctx.tenantId,
      })),
    );
  }

  async findTagsByTaskIds(
    tx: DrizzleDb,
    taskIds: string[],
    ctx: TaskContext,
  ): Promise<Array<{ taskId: string; tagId: string; tagName: string }>> {
    if (taskIds.length === 0) return [];
    const rows = await tx
      .select({
        taskId: taskTagAssignments.taskId,
        tagId: taskTags.id,
        tagName: taskTags.name,
      })
      .from(taskTagAssignments)
      .innerJoin(taskTags, eq(taskTags.id, taskTagAssignments.tagId))
      .where(
        and(
          eq(taskTagAssignments.tenantId, ctx.tenantId),
          inArray(taskTagAssignments.taskId, taskIds),
        ),
      )
      .orderBy(asc(taskTags.name));
    return rows;
  }

  /**
   * タスクのタグ割当を差分更新 (既存全削除 → 新規 INSERT)
   * - tagIds は同テナント内の task_tags.id を想定 (アプリ層で検証)
   * - tenant_id は denormalize で同梱 (RLS が WITH CHECK で確認)
   */
  async setTagsForTask(
    tx: DrizzleDb,
    taskId: string,
    tagIds: string[],
    ctx: TaskContext,
  ): Promise<void> {
    await tx
      .delete(taskTagAssignments)
      .where(
        and(
          eq(taskTagAssignments.taskId, taskId),
          eq(taskTagAssignments.tenantId, ctx.tenantId),
        ),
      );
    if (tagIds.length === 0) return;
    await tx.insert(taskTagAssignments).values(
      tagIds.map((tagId) => ({
        taskId,
        tagId,
        tenantId: ctx.tenantId,
      })),
    );
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
