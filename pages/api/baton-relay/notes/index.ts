import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { batonRelayService } from '@/features/baton-relay/lib/batonRelayService';
import {
  createNoteSchema,
  listNotesQuerySchema,
} from '@/features/baton-relay/schemas/batonRelay';
import { logger } from '@/shared/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method === 'GET') {
    const parsed = listNotesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'classId と date (YYYY-MM-DD) が必要です',
      });
    }
    const notes = await batonRelayService.listNotes(ctx, parsed.data.classId, parsed.data.date);
    return res.status(200).json({ notes });
  }

  if (req.method === 'POST') {
    const parsed = createNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? '入力が不正です',
      });
    }
    try {
      const created = await batonRelayService.createNote(ctx, parsed.data);
      return res.status(201).json({ note: created });
    } catch (err) {
      logger.error({ event: 'baton_relay.note.create.error', err });
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
