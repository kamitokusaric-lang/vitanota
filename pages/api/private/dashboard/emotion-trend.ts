// Unit-03: 感情傾向 API
// US-T-030: 教員本人の感情カテゴリ別推移を日別集計で返す
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { getEmotionTrend } from '@/features/teacher-dashboard/lib/emotionTrendService';
import { emotionTrendQuerySchema } from '@/features/teacher-dashboard/schemas/emotionTrend';
import { logger } from '@/shared/lib/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const parsed = emotionTrendQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message ?? '不正なパラメータです',
    });
  }

  const { period } = parsed.data;

  try {
    const result = await withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      (db) => getEmotionTrend(db, ctx.tenantId, ctx.userId, period)
    );

    return res.status(200).json(result);
  } catch (err) {
    logger.error(
      { event: 'emotion-trend.error', err, period },
      'Failed to fetch emotion trend'
    );
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '感情傾向データの取得に失敗しました',
    });
  }
}
