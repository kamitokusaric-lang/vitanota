// 職員室ノート コメントの OpenAPI レスポンススキーマ
// 入力 (body) は src/features/journal/schemas/journalComment.ts に定義。
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const journalCommentSchema = z
  .object({
    id: z.string().guid(),
    tenantId: z.string().guid(),
    journalEntryId: z.string().guid(),
    userId: z.string().guid().nullable(),
    body: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    userName: z.string().nullable(),
  })
  .openapi('JournalComment');

export const journalCommentsResponseSchema = z
  .object({ comments: z.array(journalCommentSchema) })
  .openapi('JournalCommentsResponse');

export const journalCommentResponseSchema = z
  .object({ comment: journalCommentSchema })
  .openapi('JournalCommentResponse');
