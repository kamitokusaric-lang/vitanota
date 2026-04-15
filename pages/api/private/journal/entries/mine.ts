// マイ記録取得（自分の全エントリ、公開・非公開両方）
// /api/private/journal/entries/mine - GET のみ
import type { NextApiRequest, NextApiResponse } from 'next';
import { journalEntryService } from '@/features/journal/lib/journalEntryService';
import { timelineQuerySchema } from '@/features/journal/schemas/journal';
import { requireAuth, mapErrorToResponse } from '@/features/journal/lib/apiHelpers';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // マイ記録は絶対にキャッシュしない（非公開エントリを含むため）
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const parsed = timelineQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '不正なクエリパラメータです',
    });
  }

  const { page, perPage } = parsed.data;
  const offset = (page - 1) * perPage;

  try {
    const entries = await journalEntryService.listMine(ctx, {
      limit: perPage,
      offset,
    });
    return res.status(200).json({ entries, page, perPage });
  } catch (err) {
    return mapErrorToResponse(err, res, 'private.journal.entries.mine');
  }
}
