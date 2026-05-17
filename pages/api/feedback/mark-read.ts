// F3: 教員の thread 既読化
// FAB モーダル accordion 展開時に呼ばれる。自テナント自ユーザーの全 submission の
// last_read_by_submitter_at を NOW() に更新 (一括既読)。
//
// 踏み絵防御:
//   - 自分の submission のみ更新 (WHERE user_id = ctx.userId AND tenant_id = ctx.tenantId)
//   - feedback_submissions に RLS なし → API 層で必ず本人フィルタを掛ける
import type { NextApiRequest, NextApiResponse } from 'next';
import { and, eq, sql } from 'drizzle-orm';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { getDb } from '@/shared/lib/db';
import { feedbackSubmissions } from '@/db/schema';
import { logger } from '@/shared/lib/logger';
import { LogEvents, logEvent } from '@/shared/lib/log-events';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  try {
    const db = await getDb();
    await db
      .update(feedbackSubmissions)
      .set({ lastReadBySubmitterAt: sql`NOW()` })
      .where(
        and(
          eq(feedbackSubmissions.userId, ctx.userId),
          eq(feedbackSubmissions.tenantId, ctx.tenantId),
        ),
      );

    logEvent(LogEvents.FeedbackThreadMarkedRead, {
      userId: ctx.userId,
      tenantId: ctx.tenantId,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ event: 'feedback.mark_read.error', err });
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '処理中にエラーが発生しました',
    });
  }
}
