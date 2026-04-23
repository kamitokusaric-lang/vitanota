// GET /api/tasks - tenant 内タスク一覧 (?ownerUserId= で絞込可)
// POST /api/tasks - 新規作成
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { taskService } from '@/features/tasks/lib/taskService';
import { createTaskSchema, listTasksQuerySchema } from '@/features/tasks/schemas/task';
import { logger } from '@/shared/lib/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method === 'GET') {
    const parsed = listTasksQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.errors[0]?.message ?? '不正なクエリ',
      });
    }
    const tasks = await taskService.listTasks(ctx, parsed.data);
    return res.status(200).json({ tasks });
  }

  if (req.method === 'POST') {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.errors[0]?.message ?? '入力が不正です',
      });
    }
    try {
      const task = await taskService.createTask(parsed.data, ctx);
      return res.status(201).json({ task });
    } catch (err) {
      logger.error({ event: 'tasks.create.error', err });
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
