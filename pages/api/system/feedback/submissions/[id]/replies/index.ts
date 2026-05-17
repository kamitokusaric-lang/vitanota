// F3: system_admin 用 返信投稿 POST
// 権限: system_admin のみ
// なりすまし防止: submission を先に SELECT して tenant_id を確定 (body から受け取らない)
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { withSystemAdmin } from '@/shared/lib/db';
import { feedbackSubmissions, feedbackReplies } from '@/db/schema';
import { feedbackReplyCreateSchema } from '@/features/feedback/lib/feedbackSchemas';
import { logger } from '@/shared/lib/logger';
import { LogEvents, logEvent } from '@/shared/lib/log-events';

const idParamSchema = z.object({ id: z.string().uuid() });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(req, res, authOptions);

  if (!session || !session.user.roles.includes('system_admin')) {
    return res.status(403).json({ error: 'FORBIDDEN', message: '権限がありません' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const idParsed = idParamSchema.safeParse(req.query);
  if (!idParsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'id が不正です' });
  }
  const { id: submissionId } = idParsed.data;

  const bodyParsed = feedbackReplyCreateSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: bodyParsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }
  const { body } = bodyParsed.data;

  try {
    const adminUserId = session.user.userId;
    const result = await withSystemAdmin(adminUserId, async (db) => {
      const [submission] = await db
        .select({
          id: feedbackSubmissions.id,
          tenantId: feedbackSubmissions.tenantId,
          userId: feedbackSubmissions.userId,
        })
        .from(feedbackSubmissions)
        .where(eq(feedbackSubmissions.id, submissionId));

      if (!submission) {
        return { notFound: true as const };
      }

      const [reply] = await db
        .insert(feedbackReplies)
        .values({
          submissionId: submission.id,
          tenantId: submission.tenantId,
          submitterUserId: submission.userId,
          replierUserId: adminUserId,
          body: body.trim(),
        })
        .returning({
          id: feedbackReplies.id,
          body: feedbackReplies.body,
          createdAt: feedbackReplies.createdAt,
        });

      return { reply, tenantId: submission.tenantId };
    });

    if ('notFound' in result) {
      return res.status(404).json({ error: 'NOT_FOUND', message: '投稿が見つかりません' });
    }

    logEvent(LogEvents.FeedbackReplyPosted, {
      userId: session.user.userId,
      tenantId: result.tenantId,
      submissionId,
      replyId: result.reply.id,
      contentLength: body.length,
    });

    return res.status(201).json({ reply: result.reply });
  } catch (err) {
    logger.error({ event: 'system.feedback.reply.post.error', err });
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '処理中にエラーが発生しました',
    });
  }
}
