// 機能 B: 教員 UI 用トピック取得 API
// is_active=true のトピックを sort_order ASC で返す
// feedback_topics は RLS なし、認証済みなら誰でも active トピックを取得可
// 権限: 認証済み (teacher / school_admin)。system_admin は tenantId 不在で requireAuth が 403
import type { NextApiRequest, NextApiResponse } from 'next';
import { eq, asc } from 'drizzle-orm';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { getDb } from '@/shared/lib/db';
import { feedbackTopics } from '@/db/schema';
import { logger } from '@/shared/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  try {
    const db = await getDb();
    const topics = await db
      .select({
        id: feedbackTopics.id,
        title: feedbackTopics.title,
        description: feedbackTopics.description,
        sortOrder: feedbackTopics.sortOrder,
      })
      .from(feedbackTopics)
      .where(eq(feedbackTopics.isActive, true))
      .orderBy(asc(feedbackTopics.sortOrder));
    return res.status(200).json({ topics });
  } catch (err) {
    logger.error({ event: 'feedback.topics.list.error', err });
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '処理中にエラーが発生しました',
    });
  }
}
