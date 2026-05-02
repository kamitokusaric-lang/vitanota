// 機能 B: 教員 → 運営 投稿 API
// tenant_id / user_id は session から強制注入 (なりすまし防止、RLS WITH CHECK でも二重防御)
// 権限: 認証済み teacher / school_admin (system_admin は tenantId 不在で requireAuth が 403)
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { feedbackSubmissions } from '@/db/schema';
import { feedbackSubmissionSchema } from '@/features/feedback/lib/feedbackSchemas';
import { logger } from '@/shared/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const parsed = feedbackSubmissionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }

  const { topicId, content } = parsed.data;

  try {
    const submission = await withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        const [created] = await tx
          .insert(feedbackSubmissions)
          .values({
            topicId,
            content: content.trim(),
            tenantId: ctx.tenantId,
            userId: ctx.userId,
          })
          .returning({ id: feedbackSubmissions.id });
        return created;
      }
    );

    logger.info({
      event: 'feedback.submitted',
      submissionId: submission.id,
      topicId,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      contentLength: content.length,
    });

    return res.status(201).json({ submission });
  } catch (err) {
    logger.error({ event: 'feedback.submit.error', err });
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '処理中にエラーが発生しました',
    });
  }
}
