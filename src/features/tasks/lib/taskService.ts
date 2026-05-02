// タスク Service: 認可・入力変換を通して Repository を呼ぶ
// teacher は owner=自分のタスクのみ作成・更新可 (RLS で担保)
// school_admin は tenant 内の任意の教員にアサイン可
import { withTenantUser } from '@/shared/lib/db';
import { pickDbRole, type AuthContext } from '@/features/journal/lib/apiHelpers';
import { taskRepo, type TaskWithOwner } from './taskRepository';
import { taskCategoryRepo } from './taskCategoryRepository';
import { TaskNotFoundError } from './errors';
import type { Task, TaskCategory } from '@/db/schema';

function parseDueDate(input: string | null | undefined): Date | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;
  return new Date(input + 'T00:00:00Z');
}

export interface CreateTaskServiceInput {
  categoryId: string;
  ownerUserId?: string;
  title: string;
  description?: string;
  dueDate?: string;
}

export interface UpdateTaskServiceInput {
  categoryId?: string;
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  status?: 'todo' | 'in_progress' | 'done';
}

export class TaskService {
  async listTasks(
    ctx: AuthContext,
    filters?: { ownerUserId?: string; scope?: 'mine' },
  ): Promise<TaskWithOwner[]> {
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
    // 誰にアサインするかは teacher / school_admin とも自由 (chimo 仕様)
    const ownerUserId = params.ownerUserId ?? ctx.userId;

    const due = parseDueDate(params.dueDate);

    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      return taskRepo.create(
        tx,
        {
          categoryId: params.categoryId,
          ownerUserId,
          createdBy: ctx.userId,
          title: params.title,
          description: params.description,
          dueDate: due ?? undefined,
        },
        ctx,
      );
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
      return updated;
    });
  }

  async deleteTask(id: string, ctx: AuthContext): Promise<void> {
    await withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const deleted = await taskRepo.delete(tx, id, ctx);
      if (!deleted) throw new TaskNotFoundError();
    });
  }

  // 元タスクから新規タスクを複製。ownerUserId は呼出側で必ず指定される。
  // status / completed_at / コメント は引き継がず、純粋な内容コピーのみ。
  async duplicateTask(
    sourceId: string,
    params: {
      ownerUserId: string;
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

      const description =
        params.description !== undefined
          ? (params.description ?? undefined)
          : (source.description ?? undefined);

      const dueDate =
        due !== undefined ? (due ?? undefined) : (source.dueDate ?? undefined);

      return taskRepo.create(
        tx,
        {
          categoryId: params.categoryId ?? source.categoryId,
          ownerUserId: params.ownerUserId,
          createdBy: ctx.userId,
          title: params.title ?? source.title,
          description,
          dueDate,
        },
        ctx,
      );
    });
  }
}

export const taskService = new TaskService();
