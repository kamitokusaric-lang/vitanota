// GET /api/task-categories - tenant 内のタスクカテゴリ一覧
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { taskService } from '@/features/tasks/lib/taskService';
import { logger } from '@/shared/lib/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  try {
    const categories = await taskService.listCategories(ctx);
    return res.status(200).json({ categories });
  } catch (err) {
    logger.error({ event: 'task-categories.list.error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
