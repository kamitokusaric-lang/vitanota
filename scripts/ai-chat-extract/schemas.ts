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

// ── kind_suggestion Lambda Event (Slice 2b・職員室ノートの種別そっと提案) ──
// 出力 schema (kindSuggestResultSchema) は src/features/ai-chat/kindSuggest.ts に正本があり
// API・Lambda・Frontend で共有する。
export const KindSuggestEventSchema = z
  .object({
    type: z.literal('kind_suggestion'),
    inputText: z.string().min(1).max(2000),
  })
  .strict();

export type KindSuggestEvent = z.infer<typeof KindSuggestEventSchema>;

// ── Lambda Event ────────────────────────────────────────────
// chimo 2026-05-20: H3 morning_plan 機能を撤去 (project_h3_reframing_20260520)。
// task_extraction (type 省略可) + kind_suggestion の union。
// ExtractEventSchema は type optional のため discriminatedUnion 不可。両者 strict なので
// union で相互排他に解決される (kind_suggestion は ExtractEventSchema.strict に弾かれる)。
export const AiChatEventSchema = z.union([
  ExtractEventSchema,
  KindSuggestEventSchema,
]);
export type AiChatEvent = z.infer<typeof AiChatEventSchema>;
