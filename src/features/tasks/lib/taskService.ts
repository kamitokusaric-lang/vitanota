// タスク Service: 認可・入力変換を通して Repository を呼ぶ
// teacher は owner=自分のタスクのみ作成・更新可 (RLS で担保)
// school_admin は tenant 内の任意の教員にアサイン可
import { withTenantUser } from '@/shared/lib/db';
import { pickDbRole, type AuthContext } from '@/features/journal/lib/apiHelpers';
import { taskRepo, type TaskWithOwner } from './taskRepository';
import { taskCategoryRepo } from './taskCategoryRepository';
import { TaskNotFoundError } from './errors';
import type { Task, TaskCategory } from '@/db/schema';

function isAdmin(ctx: AuthContext): boolean {
  return ctx.roles.includes('school_admin') || ctx.roles.includes('system_admin');
}

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
    filters?: { ownerUserId?: string },
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
    // teacher: owner=自分に強制 (RLS でも弾かれるが入力段階でも縛る)
    // admin : params.ownerUserId が指定されていれば使用、なければ自分
    const ownerUserId = isAdmin(ctx)
      ? (params.ownerUserId ?? ctx.userId)
      : ctx.userId;

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
}

export const taskService = new TaskService();
