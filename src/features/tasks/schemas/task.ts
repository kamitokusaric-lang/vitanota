// タスク管理 Zod schema
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// 5 段階: 未着手 / 今週やる / 進行中 / 確認・調整中 / 完了
export const taskStatusSchema = z.enum([
  'backlog',
  'todo',
  'in_progress',
  'review',
  'done',
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

const dueDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'YYYY-MM-DD 形式で入力してください' });

const assigneeUserIds = z
  .array(z.string().uuid())
  .min(1, '担当者を 1 名以上選択してください')
  .max(3, '担当者は 3 名までです');

export const createTaskSchema = z
  .object({
    categoryId: z.string().uuid(),
    assigneeUserIds,
    title: z.string().trim().min(1, 'タイトルを入力してください').max(15, 'タイトルは 15 文字以内で入力してください'),
    description: z.string().max(2000).optional(),
    dueDate: dueDateString.optional(),
  })
  .openapi('CreateTaskInput');

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    categoryId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(15, 'タイトルは 15 文字以内で入力してください').optional(),
    description: z.string().max(2000).nullable().optional(),
    dueDate: dueDateString.nullable().optional(),
    status: taskStatusSchema.optional(),
    assigneeUserIds: assigneeUserIds.optional(),
  })
  .openapi('UpdateTaskInput');

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const taskIdParamSchema = z
  .object({ id: z.string().uuid('不正なタスクIDです') })
  .openapi('TaskIdParam');

// 複製: assigneeUserIds は必須 (1 名以上)、その他は任意で上書き
export const duplicateTaskSchema = z
  .object({
    assigneeUserIds,
    categoryId: z.string().uuid().optional(),
    title: z.string().trim().min(1, 'タイトルを入力してください').max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    dueDate: dueDateString.nullable().optional(),
  })
  .openapi('DuplicateTaskInput');

export type DuplicateTaskInput = z.infer<typeof duplicateTaskSchema>;

// scope='mine': self が assignees に含まれる OR createdBy=self (タスクボードの「自分」フィルタ用)
// ownerUserId=X (互換): X が assignees に含まれるタスク
export const listTasksQuerySchema = z
  .object({
    ownerUserId: z.string().uuid().optional(),
    scope: z.enum(['mine']).optional(),
  })
  .openapi('ListTasksQuery');
