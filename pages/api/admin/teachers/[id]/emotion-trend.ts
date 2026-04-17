// Unit-04: GET /api/admin/teachers/[id]/emotion-trend — 特定教員の感情傾向
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { getEmotionTrendForTeacher } from '@/features/teacher-dashboard/lib/emotionTrendService';
import { emotionTrendQuerySchema } from '@/features/teacher-dashboard/schemas/emotionTrend';
import { teacherIdParamSchema } from '@/features/admin-dashboard/schemas/admin';
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

  const paramParsed = teacherIdParamSchema.safeParse(req.query);
  if (!paramParsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: '不正な教員IDです' });
  }

  const queryParsed = emotionTrendQuerySchema.safeParse(req.query);
  if (!queryParsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: '不正なパラメータです' });
  }

  const { id: teacherId } = paramParsed.data;
  const { period } = queryParsed.data;

  try {
    const result = await withTenantUser(
      ctx.tenantId, ctx.userId, pickDbRole(ctx),
      (db) => getEmotionTrendForTeacher(db, ctx.tenantId, teacherId, period)
    );
    return res.status(200).json(result);
  } catch (err) {
    logger.error({ event: 'admin.teacher-emotion-trend.error', err, teacherId });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
