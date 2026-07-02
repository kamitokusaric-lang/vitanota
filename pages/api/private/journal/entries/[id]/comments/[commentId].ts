// DELETE /api/private/journal/entries/:id/comments/:commentId
// コメント削除 (本人 or school_admin)。可否は RLS が強制。
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireAuth, mapErrorToResponse } from '@/features/journal/lib/apiHelpers';
import { journalCommentService } from '@/features/journal/lib/journalCommentService';

const paramSchema = z.object({
  id: z.string().guid(),
  commentId: z.string().guid(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const paramParsed = paramSchema.safeParse(req.query);
  if (!paramParsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR' });
  }
  const { commentId } = paramParsed.data;

  try {
    await journalCommentService.deleteComment(commentId, ctx);
    return res.status(204).end();
  } catch (err) {
    return mapErrorToResponse(err, res, 'journal.comments.delete');
  }
}
