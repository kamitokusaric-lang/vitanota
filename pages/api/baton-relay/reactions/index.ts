import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { batonRelayService } from '@/features/baton-relay/lib/batonRelayService';
import {
  listReactionsQuerySchema,
  toggleReactionSchema,
} from '@/features/baton-relay/schemas/batonRelay';
import { logger } from '@/shared/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method === 'GET') {
    const parsed = listReactionsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'classId が必要です' });
    }
    const reactions = await batonRelayService.listReactions(ctx, parsed.data.classId);
    return res.status(200).json({ reactions });
  }

  if (req.method === 'POST') {
    const parsed = toggleReactionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? '入力が不正です',
      });
    }
    try {
      const result = await batonRelayService.toggleReaction(
        ctx,
        parsed.data.studentId,
        parsed.data.reactionType,
      );
      return res.status(200).json(result);
    } catch (err) {
      logger.error({ event: 'baton_relay.reaction.toggle.error', err });
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
