// GET /api/school/teachers-workload — 教員別未完了タスク件数推移 (感情情報なし)
// school_admin 特権 (学校エンゲージメントタブの一部)
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import {
  getTeachersWorkload,
  PERIOD_DAYS,
  type PeriodKey,
} from '@/features/dashboard/lib/schoolDashboardService';
import { logger } from '@/shared/lib/logger';

function parsePeriodDays(q: unknown): number {
  const key = typeof q === 'string' ? (q as PeriodKey) : '1w';
  return PERIOD_DAYS[key] ?? PERIOD_DAYS['1w'];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (!ctx.roles.includes('school_admin')) {
    return res.status(403).json({ error: 'FORBIDDEN', message: '管理者権限が必要です' });
  }

  const periodDays = parsePeriodDays(req.query.period);

  try {
    const teachers = await withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      (db) => getTeachersWorkload(db, ctx.tenantId, periodDays),
    );
    return res.status(200).json({ teachers });
  } catch (err) {
    logger.error({ event: 'school.teachers-workload.error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
