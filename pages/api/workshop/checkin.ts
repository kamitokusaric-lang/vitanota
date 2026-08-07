// POST /api/workshop/checkin - チェックイン回答を投稿 (upsert・1人1回答・上書き可)。
// 観測者原則: 研修が有効でないテナントには 404。
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth, mapErrorToResponse } from '@/features/journal/lib/apiHelpers';
import { isWorkshopEnabledForTenant } from '@/features/workshop/featureFlag';
import { workshopService } from '@/features/workshop/lib/workshopService';
import { submitCheckinSchema } from '@/features/workshop/schemas/workshop';

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
    const parsed = submitCheckinSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? '入力が不正です',
      });
    }
    try {
      const checkin = await workshopService.submitCheckin(parsed.data.answer, ctx);
      return res.status(200).json({ checkin });
    } catch (err) {
      return mapErrorToResponse(err, res, 'workshop.checkin.submit');
    }
  }

  res.setHeader('Allow', 'POST');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
