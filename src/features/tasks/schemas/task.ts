// タスク管理 Zod schema
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const taskStatusSchema = z.enum(['todo', 'in_progress', 'done']);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

const dueDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'YYYY-MM-DD 形式で入力してください' });

export const createTaskSchema = z
  .object({
    categoryId: z.string().uuid(),
    ownerUserId: z.string().uuid().optional(),
    title: z.string().trim().min(1, 'タイトルを入力してください').max(200),
    description: z.string().max(2000).optional(),
    dueDate: dueDateString.optional(),
  })
  .openapi('CreateTaskInput');

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    categoryId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    dueDate: dueDateString.nullable().optional(),
    status: taskStatusSchema.optional(),
  })
  .openapi('UpdateTaskInput');

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const taskIdParamSchema = z
  .object({ id: z.string().uuid('不正なタスクIDです') })
  .openapi('TaskIdParam');

// scope='mine': owner=自分 OR createdBy=自分 (マイボード用、アサイン元も含む)
export const listTasksQuerySchema = z
  .object({
    ownerUserId: z.string().uuid().optional(),
    scope: z.enum(['mine']).optional(),
  })
  .openapi('ListTasksQuery');
