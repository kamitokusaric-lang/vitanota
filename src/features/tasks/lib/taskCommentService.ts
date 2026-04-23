// タスクコメント Service
// RLS で権限担保、Service 層は tenant 内のタスク存在確認のみ
import { withTenantUser } from '@/shared/lib/db';
import { pickDbRole, type AuthContext } from '@/features/journal/lib/apiHelpers';
import {
  taskCommentRepo,
  type TaskCommentWithUser,
} from './taskCommentRepository';
import { taskRepo } from './taskRepository';
import { TaskNotFoundError } from './errors';
import type { TaskComment } from '@/db/schema';

export class TaskCommentService {
  async listComments(
    taskId: string,
    ctx: AuthContext,
  ): Promise<TaskCommentWithUser[]> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      // タスク存在確認 (tenant 内) - RLS でも守られるが明示チェック
      const task = await taskRepo.findById(tx, taskId, ctx);
      if (!task) throw new TaskNotFoundError();
      return taskCommentRepo.findByTask(tx, taskId, ctx);
    });
  }

  async createComment(
    taskId: string,
    body: string,
    ctx: AuthContext,
  ): Promise<TaskComment> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const task = await taskRepo.findById(tx, taskId, ctx);
      if (!task) throw new TaskNotFoundError();
      return taskCommentRepo.create(tx, { taskId, body }, ctx);
    });
  }

  async deleteComment(commentId: string, ctx: AuthContext): Promise<void> {
    await withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const deleted = await taskCommentRepo.delete(tx, commentId, ctx);
      if (!deleted) throw new TaskNotFoundError();
    });
  }
}

export const taskCommentService = new TaskCommentService();
