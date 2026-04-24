// GET /api/school/teachers-workload — 教員別未完了タスク件数推移 (感情情報なし)
// 全員 (teacher / school_admin) がアクセス可能
// タスクは業務量の客観指標であり、カンバンで既に全員に可視化されているため
// 名前付きで推移を出すことも情報公開の増加にはならない (踏み絵通過)
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { getTeachersWorkload } from '@/features/dashboard/lib/schoolDashboardService';
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
    const teachers = await withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      (db) => getTeachersWorkload(db, ctx.tenantId),
    );
    return res.status(200).json({ teachers });
  } catch (err) {
    logger.error({ event: 'school.teachers-workload.error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
