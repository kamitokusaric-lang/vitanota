// 機能 B: system_admin 用 全投稿一覧 API
// query: tenantId? / topicId? でフィルタ可
// 権限: system_admin のみ
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { eq, desc, and, type SQL } from 'drizzle-orm';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { withSystemAdmin } from '@/shared/lib/db';
import { feedbackSubmissions, feedbackTopics, users, tenants } from '@/db/schema';
import { logger } from '@/shared/lib/logger';

const listQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
});

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

  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }

  const { tenantId, topicId } = parsed.data;
  const conditions: SQL[] = [];
  if (tenantId) conditions.push(eq(feedbackSubmissions.tenantId, tenantId));
  if (topicId) conditions.push(eq(feedbackSubmissions.topicId, topicId));

  try {
    const submissions = await withSystemAdmin(session.user.userId, async (tx) => {
      return tx
        .select({
          id: feedbackSubmissions.id,
          createdAt: feedbackSubmissions.createdAt,
          content: feedbackSubmissions.content,
          topicId: feedbackTopics.id,
          topicTitle: feedbackTopics.title,
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
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(feedbackSubmissions.createdAt));
    });

    return res.status(200).json({ submissions });
  } catch (err) {
    logger.error({ event: 'system.feedback.list.error', err });
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '処理中にエラーが発生しました',
    });
  }
}
