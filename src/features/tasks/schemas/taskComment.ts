// タスクコメント Zod schema
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const createTaskCommentSchema = z
  .object({
    body: z.string().trim().min(1, 'コメントを入力してください').max(2000),
  })
  .openapi('CreateTaskCommentInput');

export type CreateTaskCommentInput = z.infer<typeof createTaskCommentSchema>;

export const taskCommentParamSchema = z
  .object({
    id: z.string().uuid(),
    commentId: z.string().uuid().optional(),
  })
  .openapi('TaskCommentParam');
