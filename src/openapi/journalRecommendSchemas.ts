// /api/journal/recommend (ふりかえり → AIリコメンド) の OpenAPI スキーマ。
// ハンドラの zod は module top で LambdaClient を生成するため import 副作用が出る。
// ここで同等の schema を再定義する (pages/api/journal/recommend.ts と要同期)。
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// AI 出力 (recommendSchema.ts の retroRecommendResultSchema と同期)。
const retroPrimaryMeta = z
  .object({
    recipientHint: z.string().optional(),
    title: z.string().optional(),
    points: z.array(z.string()).optional(),
  })
  .openapi('RetroRecommendPrimaryMeta');

const retroPrimary = z
  .object({
    category: z.enum(['soudan', 'kansha', 'knowledge']),
    awareness: z.string(),
    draft: z.string(),
    meta: retroPrimaryMeta,
  })
  .openapi('RetroRecommendPrimary');

const retroResult = z
  .object({
    surface: z.boolean(),
    primary: retroPrimary.nullable(),
    tweet: z.object({ nudge: z.string() }).nullable(),
    reason: z.string(),
  })
  .openapi('RetroRecommendResult');

export const journalRecommendResponseSchema = z
  .object({
    recommendation: retroResult.nullable(),
    status: z.enum(['proposed', 'published', 'dismissed']).nullable(),
  })
  .openapi('JournalRecommendResponse');

export const journalRecommendPostRequestSchema = z
  .object({ entryId: z.string().guid() })
  .openapi('JournalRecommendPostInput');

export const journalRecommendPatchRequestSchema = z
  .object({
    entryId: z.string().guid(),
    status: z.enum(['published', 'dismissed']),
    // 計測用 (任意): 公開時の最終区分と本文編集の有無。
    finalCategory: z.enum(['soudan', 'kansha', 'knowledge', 'tweet']).optional(),
    bodyChanged: z.boolean().optional(),
  })
  .openapi('JournalRecommendPatchInput');

export const journalRecommendStatusResponseSchema = z
  .object({ status: z.enum(['proposed', 'published', 'dismissed']) })
  .openapi('JournalRecommendStatusResponse');
