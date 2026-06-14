// PATCH /api/baton-relay/students/[id] — 生徒の更新 (クラス移動 / 氏名・学年の修正)。
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { batonRelayService } from '@/features/baton-relay/lib/batonRelayService';
import {
  studentIdParamSchema,
  updateStudentSchema,
} from '@/features/baton-relay/schemas/batonRelay';
import { logger } from '@/shared/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const idParsed = studentIdParamSchema.safeParse(req.query);
  if (!idParsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: '不正な生徒IDです' });
  }

  if (req.method === 'PATCH') {
    const parsed = updateStudentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? '入力が不正です',
      });
    }
    try {
      const updated = await batonRelayService.updateStudent(ctx, idParsed.data.id, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: 'NOT_FOUND', message: '生徒が見つかりません' });
      }
      return res.status(200).json({ student: updated });
    } catch (err) {
      logger.error({ event: 'baton_relay.student.update.error', err });
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }

  res.setHeader('Allow', 'PATCH');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
