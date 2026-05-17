// GET    /api/tasks/:id - タスク 1 件取得 (RLS 範囲内、TaskWithAssignees shape)
// PATCH  /api/tasks/:id - タスク更新 (assignee or createdBy or school_admin)
// DELETE /api/tasks/:id - タスク削除 (同上)
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { taskService } from '@/features/tasks/lib/taskService';
import {
  TaskNotFoundError,
  InvalidAssigneeReferenceError,
  EmptyAssigneeError,
} from '@/features/tasks/lib/errors';
import { taskIdParamSchema, updateTaskSchema } from '@/features/tasks/schemas/task';
import { logger } from '@/shared/lib/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const paramParsed = taskIdParamSchema.safeParse(req.query);
  if (!paramParsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR' });
  }
  const { id } = paramParsed.data;

  if (req.method === 'GET') {
    try {
      // RLS で同テナント可視範囲のみ取得。listTasks 全件 → find by id (1 教員の
      // タスク数は数百件程度の想定、専用 repo method を増やさず最小実装)。
      const tasks = await taskService.listTasks(ctx);
      const task = tasks.find((t) => t.id === id);
      if (!task) {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }
      return res.status(200).json({ task });
    } catch (err) {
      logger.error({ event: 'tasks.get.error', err, id });
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }

  if (req.method === 'PATCH') {
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.errors[0]?.message ?? '入力が不正です',
      });
    }
    try {
      const task = await taskService.updateTask(id, parsed.data, ctx);
      return res.status(200).json({ task });
    } catch (err) {
      if (err instanceof TaskNotFoundError) {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }
      if (err instanceof EmptyAssigneeError) {
        return res.status(400).json({ error: 'EMPTY_ASSIGNEE', message: err.message });
      }
      if (err instanceof InvalidAssigneeReferenceError) {
        return res.status(400).json({
          error: 'INVALID_ASSIGNEE_REFERENCE',
          message: err.message,
          invalidIds: err.invalidIds,
        });
      }
      logger.error({ event: 'tasks.update.error', err, id });
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await taskService.deleteTask(id, ctx);
      return res.status(204).end();
    } catch (err) {
      if (err instanceof TaskNotFoundError) {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }
      logger.error({ event: 'tasks.delete.error', err, id });
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
