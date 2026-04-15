// US-T-011: エントリ編集
// US-T-012: エントリ削除
// /api/private/journal/entries/[id] - GET / PUT / DELETE
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { journalEntryService } from '@/features/journal/lib/journalEntryService';
import { updateEntrySchema } from '@/features/journal/schemas/journal';
import { requireAuth, mapErrorToResponse } from '@/features/journal/lib/apiHelpers';

const idParamSchema = z.object({
  id: z.string().uuid(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'private, no-store');

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const idParsed = idParamSchema.safeParse(req.query);
  if (!idParsed.success) {
    return res.status(400).json({ error: 'INVALID_ID', message: '不正なIDです' });
  }
  const { id } = idParsed.data;

  try {
    if (req.method === 'GET') {
      const entry = await journalEntryService.getEntryById(id, ctx);
      return res.status(200).json({ entry });
    }

    if (req.method === 'PUT') {
      const parsed = updateEntrySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message ?? '入力が不正です',
        });
      }
      const entry = await journalEntryService.updateEntry(id, parsed.data, ctx);
      return res.status(200).json({ entry });
    }

    if (req.method === 'DELETE') {
      await journalEntryService.deleteEntry(id, ctx);
      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  } catch (err) {
    return mapErrorToResponse(err, res, 'private.journal.entries.id');
  }
}
