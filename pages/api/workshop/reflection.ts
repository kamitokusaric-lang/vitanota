// POST /api/workshop/reflection - 研修後の振り返りを投稿。
// 公開 note (kind='note', is_public=true) を作成し、箱に紐付ける (1トランザクション)。
// 作成された note は職員室ノート/ボードにも自動露出する (public_journal_entries VIEW)。
// 観測者原則: 研修が有効でないテナントには 404。
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth, mapErrorToResponse } from '@/features/journal/lib/apiHelpers';
import { isWorkshopEnabledForTenant } from '@/features/workshop/featureFlag';
import { workshopService } from '@/features/workshop/lib/workshopService';
import { postReflectionSchema } from '@/features/workshop/schemas/workshop';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (!isWorkshopEnabledForTenant(ctx.tenantId)) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  if (req.method === 'POST') {
    const parsed = postReflectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? '入力が不正です',
      });
    }
    try {
      const entry = await workshopService.postReflection(parsed.data.content, ctx);
      return res.status(201).json({ entry });
    } catch (err) {
      return mapErrorToResponse(err, res, 'workshop.reflection.post');
    }
  }

  res.setHeader('Allow', 'POST');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
