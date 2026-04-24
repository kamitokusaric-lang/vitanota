// GET /api/school/wellness — 全校の感情集計 (個人特定なし)
// 全員 (teacher / school_admin) がアクセス可能
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { getSchoolWellness } from '@/features/dashboard/lib/schoolDashboardService';
import { logger } from '@/shared/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  try {
    const data = await withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      (db) => getSchoolWellness(db, ctx.tenantId),
    );
    return res.status(200).json(data);
  } catch (err) {
    logger.error({ event: 'school.wellness.error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
