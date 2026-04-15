// タグ一覧取得 / 作成
// /api/private/journal/tags - GET / POST
import type { NextApiRequest, NextApiResponse } from 'next';
import { tagService } from '@/features/journal/lib/tagService';
import { createTagSchema } from '@/features/journal/schemas/tag';
import { requireAuth, mapErrorToResponse } from '@/features/journal/lib/apiHelpers';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'private, no-store');

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  try {
    if (req.method === 'GET') {
      const tags = await tagService.listTenantTags(ctx);
      return res.status(200).json({ tags });
    }

    if (req.method === 'POST') {
      const parsed = createTagSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message ?? '入力が不正です',
        });
      }
      const tag = await tagService.createTag(parsed.data, ctx);
      return res.status(201).json({ tag });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  } catch (err) {
    return mapErrorToResponse(err, res, 'private.journal.tags');
  }
}
