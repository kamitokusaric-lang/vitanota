// タスク Service: 認可・入力変換を通して Repository を呼ぶ
// 担当者は assignees (M:N) で管理。teacher は自分が assignee or createdBy のタスクのみ更新可 (RLS で担保)
// school_admin は tenant 内の任意の教員にアサイン可
import { and, eq, inArray } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import { withTenantUser } from '@/shared/lib/db';
import { pickDbRole, type AuthContext } from '@/features/journal/lib/apiHelpers';
import { taskRepo, type TaskWithAssignees } from './taskRepository';
import { taskCategoryRepo } from './taskCategoryRepository';
import {
  TaskNotFoundError,
  InvalidTagReferenceError,
  InvalidAssigneeReferenceError,
  EmptyAssigneeError,
} from './errors';
import * as schema from '@/db/schema';
import { taskTags, userTenantRoles } from '@/db/schema';
import type { Task, TaskCategory } from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

function parseDueDate(input: string | null | undefined): Date | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;
  return new Date(input + 'T00:00:00Z');
}

export interface CreateTaskServiceInput {
  categoryId: string;
  assigneeUserIds: string[];
  title: string;
  description?: string;
  dueDate?: string;
}

export interface UpdateTaskServiceInput {
  categoryId?: string;
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  status?: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
  assigneeUserIds?: string[];
}

async function validateAssigneesInTenant(
  tx: DrizzleDb,
  userIds: string[],
  ctx: AuthContext,
): Promise<void> {
  if (userIds.length === 0) throw new EmptyAssigneeError();

  const uniqueIds = Array.from(new Set(userIds));
  const validRows = await tx
    .select({ userId: userTenantRoles.userId })
    .from(userTenantRoles)
    .where(
      and(
        eq(userTenantRoles.tenantId, ctx.tenantId),
        inArray(userTenantRoles.userId, uniqueIds),
      ),
    );
  const validIds = new Set(validRows.map((r) => r.userId));
  const invalidIds = uniqueIds.filter((id) => !validIds.has(id));
  if (invalidIds.length > 0) {
    throw new InvalidAssigneeReferenceError(invalidIds);
  }
}

export class TaskService {
  async listTasks(
    ctx: AuthContext,
    filters?: { ownerUserId?: string; scope?: 'mine' },
  ): Promise<TaskWithAssignees[]> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      return taskRepo.findAllByTenant(tx, ctx, filters);
    });
  }

  async listCategories(ctx: AuthContext): Promise<TaskCategory[]> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      return taskCategoryRepo.findAllByTenant(tx, ctx.tenantId);
    });
  }

  async createTask(
    params: CreateTaskServiceInput,
    ctx: AuthContext,
  ): Promise<Task> {
    const due = parseDueDate(params.dueDate);

    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      await validateAssigneesInTenant(tx, params.assigneeUserIds, ctx);

      const created = await taskRepo.create(
        tx,
        {
          categoryId: params.categoryId,
          createdBy: ctx.userId,
          title: params.title,
          description: params.description,
          dueDate: due ?? undefined,
        },
        ctx,
      );
      await taskRepo.setAssigneesForTask(tx, created.id, params.assigneeUserIds, ctx);
      return created;
    });
  }

  async updateTask(
    id: string,
    params: UpdateTaskServiceInput,
    ctx: AuthContext,
  ): Promise<Task> {
    const due = parseDueDate(params.dueDate);

    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const existing = await taskRepo.findById(tx, id, ctx);
      if (!existing) throw new TaskNotFoundError();

      if (params.assigneeUserIds !== undefined) {
        await validateAssigneesInTenant(tx, params.assigneeUserIds, ctx);
      }

      const updated = await taskRepo.update(
        tx,
        id,
        {
          categoryId: params.categoryId,
          title: params.title,
          description: params.description,
          dueDate: due,
          status: params.status,
        },
        ctx,
      );
      if (!updated) throw new TaskNotFoundError();

      if (params.assigneeUserIds !== undefined) {
        await taskRepo.setAssigneesForTask(tx, id, params.assigneeUserIds, ctx);
      }
      return updated;
    });
  }

  async deleteTask(id: string, ctx: AuthContext): Promise<void> {
    await withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const deleted = await taskRepo.delete(tx, id, ctx);
      if (!deleted) throw new TaskNotFoundError();
    });
  }

  // 元タスクから新規タスクを複製。assigneeUserIds は呼出側で必ず指定される。
  // status / completed_at / コメント は引き継がず、純粋な内容コピーのみ。
  async duplicateTask(
    sourceId: string,
    params: {
      assigneeUserIds: string[];
      categoryId?: string;
      title?: string;
      description?: string | null;
      dueDate?: string | null;
    },
    ctx: AuthContext,
  ): Promise<Task> {
    const due = parseDueDate(params.dueDate);

    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const source = await taskRepo.findById(tx, sourceId, ctx);
      if (!source) throw new TaskNotFoundError();

      await validateAssigneesInTenant(tx, params.assigneeUserIds, ctx);

      const description =
        params.description !== undefined
          ? (params.description ?? undefined)
          : (source.description ?? undefined);

      const dueDate =
        due !== undefined ? (due ?? undefined) : (source.dueDate ?? undefined);

      const created = await taskRepo.create(
        tx,
        {
          categoryId: params.categoryId ?? source.categoryId,
          createdBy: ctx.userId,
          title: params.title ?? source.title,
          description,
          dueDate,
        },
        ctx,
      );
      await taskRepo.setAssigneesForTask(tx, created.id, params.assigneeUserIds, ctx);
      return created;
    });
  }

  /**
   * タスクのタグ割当を差分更新 (既存全削除 → 新規 INSERT)
   * 1. 対象タスクが同テナントに存在することを検証 (= findById)
   * 2. tagIds がすべて同テナントの task_tags に属することを検証
   * 3. setTagsForTask で差分更新
   */
  async setTaskTags(
    taskId: string,
    tagIds: string[],
    ctx: AuthContext,
  ): Promise<void> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const task = await taskRepo.findById(tx, taskId, ctx);
      if (!task) throw new TaskNotFoundError();

      if (tagIds.length > 0) {
        const validRows = await tx
          .select({ id: taskTags.id })
          .from(taskTags)
          .where(
            and(eq(taskTags.tenantId, ctx.tenantId), inArray(taskTags.id, tagIds)),
          );
        const validIds = new Set(validRows.map((r) => r.id));
        const invalidIds = tagIds.filter((id) => !validIds.has(id));
        if (invalidIds.length > 0) {
          throw new InvalidTagReferenceError(invalidIds);
        }
      }

      await taskRepo.setTagsForTask(tx, taskId, tagIds, ctx);
    });
  }

  /**
   * タスクの assignee 割当を差分更新 (個別 API 用)
   * 1. 対象タスクが同テナントに存在することを検証
   * 2. userIds がすべて同テナントに所属することを検証 (1 件以上必須)
   * 3. setAssigneesForTask で差分更新
   */
  async setTaskAssignees(
    taskId: string,
    userIds: string[],
    ctx: AuthContext,
  ): Promise<void> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const task = await taskRepo.findById(tx, taskId, ctx);
      if (!task) throw new TaskNotFoundError();

      await validateAssigneesInTenant(tx, userIds, ctx);
      await taskRepo.setAssigneesForTask(tx, taskId, userIds, ctx);
    });
  }
}

export const taskService = new TaskService();
