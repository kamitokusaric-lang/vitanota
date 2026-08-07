// POST   /api/grade-meeting/tasks - 学年の「やること」を1つ起こす
// DELETE /api/grade-meeting/tasks - 会から「やること」を外す (tasks 本体は残す)
//
// 実体は既存 tasks に作り、中間テーブルで会に紐付ける。
// 担当・期限・完了はタスク側の仕組みをそのまま使う (二重に作らない)。
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth, mapErrorToResponse } from '@/features/journal/lib/apiHelpers';
import { gradeMeetingService } from '@/features/grade-meeting/lib/gradeMeetingService';
import {
  createGradeTaskSchema,
  unlinkGradeTaskSchema,
} from '@/features/grade-meeting/schemas/gradeMeeting';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method === 'POST') {
    const parsed = createGradeTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? '入力が不正です',
      });
    }
    try {
      const task = await gradeMeetingService.createTask(parsed.data, ctx);
      return res.status(200).json({ task });
    } catch (err) {
      return mapErrorToResponse(err, res, 'gradeMeeting.task.create');
    }
  }

  if (req.method === 'DELETE') {
    const parsed = unlinkGradeTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? '入力が不正です',
      });
    }
    try {
      const ok = await gradeMeetingService.unlinkTask(parsed.data, ctx);
      if (!ok) return res.status(404).json({ error: 'NOT_FOUND' });
      return res.status(204).end();
    } catch (err) {
      return mapErrorToResponse(err, res, 'gradeMeeting.task.unlink');
    }
  }

  res.setHeader('Allow', 'POST, DELETE');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
