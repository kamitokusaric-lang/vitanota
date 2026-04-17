// Unit-04: GET /api/admin/emotion-trend — 学校全体の感情傾向
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { getSchoolEmotionTrend } from '@/features/teacher-dashboard/lib/emotionTrendService';
import { emotionTrendQuerySchema } from '@/features/teacher-dashboard/schemas/emotionTrend';
import { logger } from '@/shared/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (!ctx.roles.includes('school_admin')) {
    return res.status(403).json({ error: 'FORBIDDEN', message: '管理者権限が必要です' });
  }

  const parsed = emotionTrendQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR' });
  }

  try {
    const result = await withTenantUser(
      ctx.tenantId, ctx.userId, pickDbRole(ctx),
      (db) => getSchoolEmotionTrend(db, ctx.tenantId, parsed.data.period)
    );
    return res.status(200).json(result);
  } catch (err) {
    logger.error({ event: 'admin.school-emotion-trend.error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
