// AI 抽出結果の Zod schema (Lambda・API・Frontend 共通の検証)。
//
// AI 出力は信頼できないので strict() で未知フィールドを弾く。
// confidence は high/medium/low、未分類は category_id = null を許容。

import { z } from 'zod';

export const TaskCandidateSchema = z
  .object({
    title: z.string().min(1).max(200),
    category_id: z.string().nullable(),
    due_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    memo: z.string().max(500),
    confidence: z.enum(['high', 'medium', 'low']),
  })
  .strict();

export const ExtractionResultSchema = z
  .object({
    tasks: z.array(TaskCandidateSchema),
    needsConfirmation: z.array(z.string().max(200)),
  })
  .strict();

export type TaskCandidate = z.infer<typeof TaskCandidateSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

// ── extract Lambda Event (task_extraction、既存) ─────────────
// type は後方互換のため optional。指定なしは task_extraction 扱い。
export const ExtractEventSchema = z
  .object({
    type: z.literal('task_extraction').optional(),
    inputText: z.string().min(1).max(2000),
  })
  .strict();

export type ExtractEvent = z.infer<typeof ExtractEventSchema>;

// ── morning_plan Lambda Event / Result (H3) ─────────────────
// 「朝の見通し作り」: 既存タスクから AI が 2 軸 (today / optional) に分類。
// chimo 提供の today_plan_v1 プロンプト用 input / output schema。

export const MorningPlanTaskInputSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    assignees: z.array(
      z.object({ id: z.string(), name: z.string() }).strict(),
    ),
    category: z.string().nullable(),
    tags: z.array(z.string()),
    due_date: z.string().nullable(),
    description: z.string(),
    comments: z.array(z.string()),
    status: z.string(),
  })
  .strict();

export const MorningPlanEventSchema = z
  .object({
    type: z.literal('morning_plan'),
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    currentUser: z.object({ id: z.string(), name: z.string() }).strict(),
    capacity: z.enum(['low', 'normal', 'high']),
    tasks: z.array(MorningPlanTaskInputSchema).max(200),
  })
  .strict();

export type MorningPlanEvent = z.infer<typeof MorningPlanEventSchema>;

export const MorningPlanItemSchema = z
  .object({
    task_id: z.string(),
    reason: z.string(),
    suggested_action: z.string(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const MorningPlanResultSchema = z
  .object({
    summary: z.string(),
    today: z.array(MorningPlanItemSchema),
    optional: z.array(MorningPlanItemSchema),
    not_shown_task_ids: z.array(z.string()),
    notes: z.array(z.string()).max(2),
  })
  .strict();

export type MorningPlanItem = z.infer<typeof MorningPlanItemSchema>;
export type MorningPlanResult = z.infer<typeof MorningPlanResultSchema>;

// ── Lambda Event discriminated union ────────────────────────
export const AiChatEventSchema = z.union([
  ExtractEventSchema,
  MorningPlanEventSchema,
]);
export type AiChatEvent = z.infer<typeof AiChatEventSchema>;
