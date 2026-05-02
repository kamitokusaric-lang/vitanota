// 機能 B: system_admin 用 トピック一覧 + 新規追加 API
// 権限: system_admin のみ
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { asc, eq, sql } from 'drizzle-orm';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { withSystemAdmin } from '@/shared/lib/db';
import { feedbackTopics, feedbackSubmissions } from '@/db/schema';
import { feedbackTopicCreateSchema } from '@/features/feedback/lib/feedbackSchemas';
import { logger } from '@/shared/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(req, res, authOptions);

  if (!session || !session.user.roles.includes('system_admin')) {
    return res.status(403).json({ error: 'FORBIDDEN', message: '権限がありません' });
  }

  if (req.method === 'GET') {
    return handleList(res, session.user.userId);
  }
  if (req.method === 'POST') {
    return handleCreate(req, res, session.user.userId);
  }
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
}

async function handleList(res: NextApiResponse, adminUserId: string) {
  try {
    const topics = await withSystemAdmin(adminUserId, async (tx) => {
      return tx
        .select({
          id: feedbackTopics.id,
          title: feedbackTopics.title,
          description: feedbackTopics.description,
          isActive: feedbackTopics.isActive,
          sortOrder: feedbackTopics.sortOrder,
          createdAt: feedbackTopics.createdAt,
          updatedAt: feedbackTopics.updatedAt,
          submissionCount: sql<number>`(
            SELECT COUNT(*)::int FROM ${feedbackSubmissions}
            WHERE ${feedbackSubmissions.topicId} = ${feedbackTopics.id}
          )`,
        })
        .from(feedbackTopics)
        .orderBy(asc(feedbackTopics.sortOrder), asc(feedbackTopics.createdAt));
    });
    return res.status(200).json({ topics });
  } catch (err) {
    logger.error({ event: 'system.feedback.topics.list.error', err });
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '処理中にエラーが発生しました',
    });
  }
}

async function handleCreate(
  req: NextApiRequest,
  res: NextApiResponse,
  adminUserId: string
) {
  const parsed = feedbackTopicCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }

  const { title, description, sortOrder, isActive } = parsed.data;

  try {
    const created = await withSystemAdmin(adminUserId, async (tx) => {
      const [row] = await tx
        .insert(feedbackTopics)
        .values({
          title: title.trim(),
          description: description?.trim() || null,
          sortOrder,
          isActive,
        })
        .returning();
      return row;
    });

    logger.info({
      event: 'system.feedback.topic.created',
      topicId: created.id,
      title: created.title,
      adminUserId,
    });

    // 新規行は submissionCount = 0 で返す (一覧 API と形を揃える)
    return res.status(201).json({ topic: { ...created, submissionCount: 0 } });
  } catch (err) {
    logger.error({ event: 'system.feedback.topics.create.error', err });
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '処理中にエラーが発生しました',
    });
  }
}
