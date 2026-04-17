// Unit-04: GET /api/admin/alerts — アクティブアラート一覧
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { getOpenAlerts } from '@/features/admin-dashboard/lib/alertService';
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

  try {
    const alertList = await withTenantUser(
      ctx.tenantId, ctx.userId, pickDbRole(ctx),
      (db) => getOpenAlerts(db, ctx.tenantId)
    );
    return res.status(200).json({ alerts: alertList });
  } catch (err) {
    logger.error({ event: 'admin.alerts.error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
