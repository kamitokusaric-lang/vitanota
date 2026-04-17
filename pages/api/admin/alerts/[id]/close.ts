// Unit-04: PUT /api/admin/alerts/[id]/close — アラートクローズ
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { closeAlert } from '@/features/admin-dashboard/lib/alertService';
import { alertIdParamSchema } from '@/features/admin-dashboard/schemas/admin';
import { logger } from '@/shared/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (!ctx.roles.includes('school_admin')) {
    return res.status(403).json({ error: 'FORBIDDEN', message: '管理者権限が必要です' });
  }

  const parsed = alertIdParamSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: '不正なアラートIDです' });
  }

  try {
    const result = await withTenantUser(
      ctx.tenantId, ctx.userId, pickDbRole(ctx),
      (db) => closeAlert(db, parsed.data.id, ctx.userId, ctx.tenantId)
    );

    if (!result) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'アラートが見つからないか、既にクローズ済みです' });
    }

    return res.status(200).json({ alert: result });
  } catch (err) {
    logger.error({ event: 'admin.alert-close.error', err, alertId: parsed.data.id });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
