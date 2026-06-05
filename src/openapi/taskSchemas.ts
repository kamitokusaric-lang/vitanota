// tasks 系エンドポイントの OpenAPI レスポンススキーマ + 一部リクエスト inline schema。
// リクエスト型は features/tasks/schemas/ と src/schemas/ に既存 (registry が import)。
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { taskStatusSchema } from '@/features/tasks/schemas/task';
import { taskFilterSettingsSchema } from '@/schemas/userFilterPreferences';

extendZodWithOpenApi(z);

// ─── 部分型 ────────────────────────────────────────────────
const taskAssigneeSummarySchema = z
  .object({
    userId: z.string().guid(),
    name: z.string().nullable(),
    nickname: z.string().nullable(),
  })
  .openapi('TaskAssigneeSummary');

const taskTagSummarySchema = z
  .object({
    id: z.string().guid(),
    name: z.string().openapi({ example: '校務' }),
  })
  .openapi('TaskTagSummary');

// ─── タスク本体 (一覧・単体共通) ────────────────────────────
export const taskSchema = z
  .object({
    id: z.string().guid(),
    tenantId: z.string().guid(),
    categoryId: z.string().guid(),
    createdBy: z.string().guid(),
    title: z.string().openapi({ example: '保護者対応メモ' }),
    description: z.string().nullable(),
    dueDate: z.string().nullable().openapi({ example: '2026-06-30' }),
    status: taskStatusSchema,
    completedAt: z.string().datetime().nullable(),
    sourceChatSnippet: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    assignees: z.array(taskAssigneeSummarySchema),
    commentCount: z.number().int(),
    tags: z.array(taskTagSummarySchema),
  })
  .openapi('Task');

export const tasksListResponseSchema = z
  .object({ tasks: z.array(taskSchema) })
  .openapi('TasksListResponse');

export const taskResponseSchema = z
  .object({ task: taskSchema })
  .openapi('TaskResponse');

// ─── コメント ───────────────────────────────────────────────
export const taskCommentSchema = z
  .object({
    id: z.string().guid(),
    tenantId: z.string().guid(),
    taskId: z.string().guid(),
    userId: z.string().guid().nullable(),
    body: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    userName: z.string().nullable(),
  })
  .openapi('TaskComment');

export const taskCommentsResponseSchema = z
  .object({ comments: z.array(taskCommentSchema) })
  .openapi('TaskCommentsResponse');

export const taskCommentResponseSchema = z
  .object({ comment: taskCommentSchema })
  .openapi('TaskCommentResponse');

// ─── 担当者候補 ─────────────────────────────────────────────
export const assigneeSchema = z
  .object({
    userId: z.string().guid(),
    name: z.string().nullable(),
    email: z.string().openapi({ example: 'teacher@example.com' }),
  })
  .openapi('Assignee');

export const assigneesResponseSchema = z
  .object({ assignees: z.array(assigneeSchema) })
  .openapi('AssigneesResponse');

// ─── カテゴリ ───────────────────────────────────────────────
export const taskCategorySchema = z
  .object({
    id: z.string().guid(),
    tenantId: z.string().guid(),
    name: z.string().openapi({ example: '校務' }),
    isSystemDefault: z.boolean(),
    sortOrder: z.number().int(),
    createdBy: z.string().guid().nullable(),
    createdAt: z.string().datetime(),
  })
  .openapi('TaskCategory');

export const taskCategoriesResponseSchema = z
  .object({ categories: z.array(taskCategorySchema) })
  .openapi('TaskCategoriesResponse');

// ─── タスクタグ ─────────────────────────────────────────────
export const taskTagSchema = z
  .object({
    id: z.string().guid(),
    name: z.string().openapi({ example: '研究授業' }),
    createdBy: z.string().guid().nullable(),
    createdAt: z.string().datetime(),
    assignmentCount: z.number().int().openapi({ example: 0 }),
  })
  .openapi('TaskTag');

export const taskTagsListResponseSchema = z
  .object({ tags: z.array(taskTagSchema) })
  .openapi('TaskTagsListResponse');

export const taskTagResponseSchema = z
  .object({ tag: taskTagSchema })
  .openapi('TaskTagResponse');

// ─── 汎用 ───────────────────────────────────────────────────
export const okResponseSchema = z
  .object({ ok: z.literal(true) })
  .openapi('OkResponse');

// PUT /api/tasks/{id}/tags のリクエスト body (タスクに付けるタグ集合の置換)
export const setTaskTagsSchema = z
  .object({ tagIds: z.array(z.string().guid()) })
  .openapi('SetTaskTagsInput');

// GET /api/users/me/filter-preferences/tasks のレスポンス (未保存なら null)
export const taskFilterPreferenceResponseSchema = z
  .object({ preference: taskFilterSettingsSchema.nullable() })
  .openapi('TaskFilterPreferenceResponse');
