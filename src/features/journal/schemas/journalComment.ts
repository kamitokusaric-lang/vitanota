// 職員室ノート (公開 journal_entries) コメントの Zod schema
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const createJournalCommentSchema = z
  .object({
    body: z.string().trim().min(1, 'コメントを入力してください').max(2000),
  })
  .openapi('CreateJournalCommentInput');

export type CreateJournalCommentInput = z.infer<typeof createJournalCommentSchema>;
