// タグ削除（school_admin のみ）
// /api/private/journal/tags/[id] - DELETE のみ
import type { NextApiRequest, NextApiResponse } from 'next';
import { tagService } from '@/features/journal/lib/tagService';
import { tagIdParamSchema } from '@/features/journal/schemas/tag';
import { requireAuth, mapErrorToResponse } from '@/features/journal/lib/apiHelpers';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const parsed = tagIdParamSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'INVALID_ID', message: '不正なIDです' });
  }

  try {
    const result = await tagService.deleteTag(parsed.data.id, ctx);
    return res.status(200).json({ affectedEntries: result.affectedEntries });
  } catch (err) {
    return mapErrorToResponse(err, res, 'private.journal.tags.delete');
  }
}
