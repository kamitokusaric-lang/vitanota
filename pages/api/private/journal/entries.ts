// US-T-010: 日誌エントリ作成
// /api/private/journal/entries - POST のみ
// SP-U02-04 Layer 1: /api/private/* は CloudFront キャッシュ無効
import type { NextApiRequest, NextApiResponse } from 'next';
import { journalEntryService } from '@/features/journal/lib/journalEntryService';
import { createEntrySchema } from '@/features/journal/schemas/journal';
import { requireAuth, mapErrorToResponse } from '@/features/journal/lib/apiHelpers';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // 個人情報を扱うためキャッシュ禁止
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const parsed = createEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }

  try {
    const entry = await journalEntryService.createEntry(parsed.data, ctx);
    return res.status(201).json({ entry });
  } catch (err) {
    return mapErrorToResponse(err, res, 'private.journal.entries.create');
  }
}
