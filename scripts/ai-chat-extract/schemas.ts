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

// ── Lambda Event ────────────────────────────────────────────
// chimo 2026-05-20: H3 morning_plan 機能を撤去 (project_h3_reframing_20260520)。
// 旧 MorningPlanEventSchema / MorningPlanResultSchema / MorningPlanTaskInputSchema /
// MorningPlanItemSchema は削除。 今は task_extraction のみ。
export const AiChatEventSchema = ExtractEventSchema;
export type AiChatEvent = z.infer<typeof AiChatEventSchema>;
