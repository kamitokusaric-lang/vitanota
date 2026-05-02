// POST /api/tasks/:id/duplicate - 元タスクから新規タスクを複製
// status は 'todo' から開始、コメントは引き継がない
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { taskService } from '@/features/tasks/lib/taskService';
import { TaskNotFoundError } from '@/features/tasks/lib/errors';
import { duplicateTaskSchema, taskIdParamSchema } from '@/features/tasks/schemas/task';
import { logger } from '@/shared/lib/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const paramParsed = taskIdParamSchema.safeParse(req.query);
  if (!paramParsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR' });
  }
  const { id } = paramParsed.data;

  const bodyParsed = duplicateTaskSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: bodyParsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }

  try {
    const task = await taskService.duplicateTask(id, bodyParsed.data, ctx);
    return res.status(201).json({ task });
  } catch (err) {
    if (err instanceof TaskNotFoundError) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    logger.error({ event: 'tasks.duplicate.error', err, sourceId: id });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
