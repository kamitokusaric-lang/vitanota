// GET /api/tasks/:id/comments - コメント一覧
// POST /api/tasks/:id/comments - コメント追加
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { taskCommentService } from '@/features/tasks/lib/taskCommentService';
import { TaskNotFoundError } from '@/features/tasks/lib/errors';
import { createTaskCommentSchema } from '@/features/tasks/schemas/taskComment';
import { logger } from '@/shared/lib/logger';

const idParamSchema = z.object({ id: z.string().uuid() });

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
  const { id: taskId } = paramParsed.data;

  if (req.method === 'GET') {
    try {
      const comments = await taskCommentService.listComments(taskId, ctx);
      return res.status(200).json({ comments });
    } catch (err) {
      if (err instanceof TaskNotFoundError) {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }
      logger.error({ event: 'task-comments.list.error', err, taskId });
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }

  if (req.method === 'POST') {
    const parsed = createTaskCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.errors[0]?.message ?? '入力が不正です',
      });
    }
    try {
      const comment = await taskCommentService.createComment(
        taskId,
        parsed.data.body,
        ctx,
      );
      return res.status(201).json({ comment });
    } catch (err) {
      if (err instanceof TaskNotFoundError) {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }
      logger.error({ event: 'task-comments.create.error', err, taskId });
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
