// PUT /api/tasks/:id/tags - タスクのタグ割当を差分更新
// body: { tagIds: string[] }
// 既存割当を全削除して新規 INSERT。同テナント内全員が呼べる (= タグも自由付与可)
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { taskService } from '@/features/tasks/lib/taskService';
import { TaskNotFoundError, InvalidTagReferenceError } from '@/features/tasks/lib/errors';
import { logger } from '@/shared/lib/logger';

const idParamSchema = z.object({ id: z.string().uuid() });

const setTagsSchema = z.object({
  tagIds: z
    .array(z.string().uuid())
    .max(20, 'タグは 1 タスクあたり 20 件までです'),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return res.status(405).end();
  }

  const idParsed = idParamSchema.safeParse(req.query);
  if (!idParsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'id が不正です' });
  }

  const bodyParsed = setTagsSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: bodyParsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }

  try {
    await taskService.setTaskTags(idParsed.data.id, bodyParsed.data.tagIds, ctx);
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof TaskNotFoundError) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    if (err instanceof InvalidTagReferenceError) {
      return res.status(400).json({
        error: 'INVALID_TAG_REFERENCE',
        message: '指定されたタグが見つかりません',
        invalidIds: err.invalidIds,
      });
    }
    logger.error({ event: 'tasks.setTags.error', err, taskId: idParsed.data.id });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
