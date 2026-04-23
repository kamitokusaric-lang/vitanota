// DELETE /api/tasks/:id/comments/:commentId - コメント削除 (自分 or school_admin)
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { taskCommentService } from '@/features/tasks/lib/taskCommentService';
import { TaskNotFoundError } from '@/features/tasks/lib/errors';
import { logger } from '@/shared/lib/logger';

const paramSchema = z.object({
  id: z.string().uuid(),
  commentId: z.string().uuid(),
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
    await taskCommentService.deleteComment(commentId, ctx);
    return res.status(204).end();
  } catch (err) {
    if (err instanceof TaskNotFoundError) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    logger.error({ event: 'task-comments.delete.error', err, commentId });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
