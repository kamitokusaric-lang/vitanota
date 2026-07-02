// GET  /api/private/journal/entries/:id/comments - コメント一覧
// POST /api/private/journal/entries/:id/comments - コメント追加
// 職員室ノート (公開 journal_entries) へのコメント。非公開エントリは service が 403。
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireAuth, mapErrorToResponse } from '@/features/journal/lib/apiHelpers';
import { journalCommentService } from '@/features/journal/lib/journalCommentService';
import { createJournalCommentSchema } from '@/features/journal/schemas/journalComment';

const idParamSchema = z.object({ id: z.string().guid() });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const paramParsed = idParamSchema.safeParse(req.query);
  if (!paramParsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR' });
  }
  const { id: entryId } = paramParsed.data;

  if (req.method === 'GET') {
    try {
      const comments = await journalCommentService.listComments(entryId, ctx);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({ comments });
    } catch (err) {
      return mapErrorToResponse(err, res, 'journal.comments.list');
    }
  }

  if (req.method === 'POST') {
    const parsed = createJournalCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? '入力が不正です',
      });
    }
    try {
      const comment = await journalCommentService.createComment(
        entryId,
        parsed.data.body,
        ctx,
      );
      return res.status(201).json({ comment });
    } catch (err) {
      return mapErrorToResponse(err, res, 'journal.comments.create');
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
