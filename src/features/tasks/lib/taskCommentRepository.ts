// タスクコメント Repository
import { and, asc, eq } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import { taskComments, users } from '@/db/schema';
import type * as schema from '@/db/schema';
import type { TaskComment } from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export type TaskCommentWithUser = TaskComment & {
  userName: string | null;
};

export interface TaskCommentContext {
  userId: string;
  tenantId: string;
}

export class TaskCommentRepository {
  async findByTask(
    tx: DrizzleDb,
    taskId: string,
    ctx: TaskCommentContext,
  ): Promise<TaskCommentWithUser[]> {
    const rows = await tx
      .select({
        id: taskComments.id,
        tenantId: taskComments.tenantId,
        taskId: taskComments.taskId,
        userId: taskComments.userId,
        body: taskComments.body,
        createdAt: taskComments.createdAt,
        updatedAt: taskComments.updatedAt,
        userName: users.name,
      })
      .from(taskComments)
      .leftJoin(users, eq(users.id, taskComments.userId))
      .where(
        and(
          eq(taskComments.taskId, taskId),
          eq(taskComments.tenantId, ctx.tenantId),
        ),
      )
      .orderBy(asc(taskComments.createdAt));
    return rows;
  }

  async create(
    tx: DrizzleDb,
    params: { taskId: string; body: string },
    ctx: TaskCommentContext,
  ): Promise<TaskComment> {
    const [row] = await tx
      .insert(taskComments)
      .values({
        tenantId: ctx.tenantId,
        taskId: params.taskId,
        userId: ctx.userId,
        body: params.body,
      })
      .returning();
    return row;
  }

  async delete(
    tx: DrizzleDb,
    commentId: string,
    ctx: TaskCommentContext,
  ): Promise<boolean> {
    const result = await tx
      .delete(taskComments)
      .where(
        and(
          eq(taskComments.id, commentId),
          eq(taskComments.tenantId, ctx.tenantId),
        ),
      )
      .returning({ id: taskComments.id });
    return result.length > 0;
  }
}

export const taskCommentRepo = new TaskCommentRepository();
