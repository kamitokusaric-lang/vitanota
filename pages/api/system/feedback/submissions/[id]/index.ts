// F3: system_admin 用 submission 詳細 + replies 取得
// 権限: system_admin のみ
// feedback_replies に触るため withSystemAdmin で RLS 設定 (app.role='system_admin')
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { eq, and, asc } from 'drizzle-orm';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { withSystemAdmin } from '@/shared/lib/db';
import {
  feedbackSubmissions,
  feedbackTopics,
  feedbackReplies,
  users,
  tenants,
} from '@/db/schema';
import { logger } from '@/shared/lib/logger';

const idParamSchema = z.object({ id: z.string().guid() });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(req, res, authOptions);

  if (!session || !session.user.roles.includes('system_admin')) {
    return res.status(403).json({ error: 'FORBIDDEN', message: '権限がありません' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const parsed = idParamSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'id が不正です' });
  }
  const { id } = parsed.data;

  try {
    const result = await withSystemAdmin(session.user.userId, async (db) => {
      const [submission] = await db
        .select({
          id: feedbackSubmissions.id,
          createdAt: feedbackSubmissions.createdAt,
          content: feedbackSubmissions.content,
          topicId: feedbackTopics.id,
          topicTitle: feedbackTopics.title,
          userId: users.id,
          userEmail: users.email,
          userName: users.name,
          tenantId: tenants.id,
          tenantName: tenants.name,
          tenantSlug: tenants.slug,
        })
        .from(feedbackSubmissions)
        .innerJoin(feedbackTopics, eq(feedbackTopics.id, feedbackSubmissions.topicId))
        .innerJoin(users, eq(users.id, feedbackSubmissions.userId))
        .innerJoin(tenants, eq(tenants.id, feedbackSubmissions.tenantId))
        .where(eq(feedbackSubmissions.id, id));

      if (!submission) {
        return null;
      }

      const replies = await db
        .select({
          id: feedbackReplies.id,
          body: feedbackReplies.body,
          createdAt: feedbackReplies.createdAt,
          replierUserId: feedbackReplies.replierUserId,
        })
        .from(feedbackReplies)
        .where(
          and(
            eq(feedbackReplies.submissionId, id),
            eq(feedbackReplies.tenantId, submission.tenantId),
          ),
        )
        .orderBy(asc(feedbackReplies.createdAt));

      return { submission, replies };
    });

    if (!result) {
      return res.status(404).json({ error: 'NOT_FOUND', message: '投稿が見つかりません' });
    }
    return res.status(200).json(result);
  } catch (err) {
    logger.error({ event: 'system.feedback.submission.get.error', err });
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '処理中にエラーが発生しました',
    });
  }
}
