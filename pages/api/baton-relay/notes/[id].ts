import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { batonRelayService } from '@/features/baton-relay/lib/batonRelayService';
import {
  noteIdParamSchema,
  updateNoteSchema,
} from '@/features/baton-relay/schemas/batonRelay';
import { logger } from '@/shared/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const idParsed = noteIdParamSchema.safeParse(req.query);
  if (!idParsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: '不正なノートIDです' });
  }
  const id = idParsed.data.id;

  if (req.method === 'PATCH') {
    const parsed = updateNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? '入力が不正です',
      });
    }
    try {
      // RLS で自分の行以外は 0 件更新 → NOT_FOUND
      const updated = await batonRelayService.updateNote(ctx, id, parsed.data.content);
      if (!updated) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'ノートが見つかりません' });
      }
      return res.status(200).json({ note: updated });
    } catch (err) {
      logger.error({ event: 'baton_relay.note.update.error', err });
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const ok = await batonRelayService.deleteNote(ctx, id);
      if (!ok) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'ノートが見つかりません' });
      }
      return res.status(204).end();
    } catch (err) {
      logger.error({ event: 'baton_relay.note.delete.error', err });
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }

  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
