import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { batonRelayService } from '@/features/baton-relay/lib/batonRelayService';
import {
  classIdParamSchema,
  updateClassSchema,
} from '@/features/baton-relay/schemas/batonRelay';
import { logger } from '@/shared/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const idParsed = classIdParamSchema.safeParse(req.query);
  if (!idParsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: '不正なクラスIDです' });
  }

  if (req.method === 'PATCH') {
    const parsed = updateClassSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? '入力が不正です',
      });
    }
    try {
      const updated = await batonRelayService.updateClass(ctx, idParsed.data.id, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'クラスが見つかりません' });
      }
      return res.status(200).json({ class: updated });
    } catch (err) {
      logger.error({ event: 'baton_relay.class.update.error', err });
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }

  res.setHeader('Allow', 'PATCH');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
