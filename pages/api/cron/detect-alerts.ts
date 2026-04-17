// Unit-04: POST /api/cron/detect-alerts — アラート検知バッチ
// MVP: session 認証（school_admin or system_admin が手動実行）
// 将来: EventBridge Scheduler から API キー認証で自動実行
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { withSystemAdmin } from '@/shared/lib/db';
import { detectAll } from '@/features/admin-dashboard/lib/alertDetectionService';
import { logger } from '@/shared/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (!ctx.roles.includes('school_admin') && !ctx.roles.includes('system_admin')) {
    return res.status(403).json({ error: 'FORBIDDEN', message: '管理者権限が必要です' });
  }

  try {
    const results = await withSystemAdmin(ctx.userId, (db) => detectAll(db));

    const totalCreated = results.reduce((sum, r) => sum + r.alertsCreated, 0);
    const totalChecked = results.reduce((sum, r) => sum + r.teachersChecked, 0);

    logger.info({
      event: 'cron.detect-alerts.completed',
      tenantsProcessed: results.length,
      totalCreated,
      totalChecked,
    });

    return res.status(200).json({
      tenantsProcessed: results.length,
      totalAlertsCreated: totalCreated,
      totalTeachersChecked: totalChecked,
      details: results,
    });
  } catch (err) {
    logger.error({ event: 'cron.detect-alerts.error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
