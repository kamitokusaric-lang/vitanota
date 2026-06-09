import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { batonRelayService } from '@/features/baton-relay/lib/batonRelayService';
import { importRequestSchema } from '@/features/baton-relay/schemas/batonRelay';
import { logger } from '@/shared/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const parsed = importRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message ?? '入力が不正です',
    });
  }

  try {
    const result = await batonRelayService.importRoster(ctx, parsed.data.rows);
    return res.status(200).json(result);
  } catch (err) {
    logger.error({ event: 'baton_relay.import.error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
