// POST /api/workshop/team-reflection - チーム振り返りを保存 (upsert・1班1枚・上書き可)。
// チームの誰が書いても同じ1枚を更新する (入力係が交代できる)。
// 箱の中に閉じる: journal に乗せないので職員室ノートには流れない。
// 観測者原則: 研修が有効でないテナントには 404。
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth, mapErrorToResponse } from '@/features/journal/lib/apiHelpers';
import { isWorkshopEnabledForTenant } from '@/features/workshop/featureFlag';
import { workshopService } from '@/features/workshop/lib/workshopService';
import { upsertTeamReflectionSchema } from '@/features/workshop/schemas/workshop';

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
    const parsed = upsertTeamReflectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? '入力が不正です',
      });
    }
    try {
      const teamReflection = await workshopService.upsertTeamReflection(
        parsed.data,
        ctx,
      );
      return res.status(200).json({ teamReflection });
    } catch (err) {
      return mapErrorToResponse(err, res, 'workshop.teamReflection.upsert');
    }
  }

  res.setHeader('Allow', 'POST');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
