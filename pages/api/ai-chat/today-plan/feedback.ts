// POST /api/ai-chat/today-plan/feedback — 「今日の見通しは持てましたか?」フィードバック保存。
//
// outlookScore: 'held' (持てた) | 'somewhat' (少し持てた) | 'difficult' (まだ難しい)
// ai_sessions.ai_output_json.feedback に追記する。一度回答すれば二度は出さない。

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { aiSessions } from '@/db/schema';
import { logger } from '@/shared/lib/logger';
import { isAiChatEnabledForTenant } from '@/features/ai-chat/featureFlag';

const RequestSchema = z.object({
  sessionId: z.string().uuid(),
  outlookScore: z.enum(['held', 'somewhat', 'difficult']),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (!isAiChatEnabledForTenant(ctx.tenantId)) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }

  const { sessionId, outlookScore } = parsed.data;
  const role = pickDbRole(ctx);

  try {
    await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      const rows = await tx
        .select({ aiOutputJson: aiSessions.aiOutputJson })
        .from(aiSessions)
        .where(
          and(eq(aiSessions.id, sessionId), eq(aiSessions.userId, ctx.userId)),
        );
      if (rows.length === 0) throw new Error('SESSION_NOT_FOUND');
      const existing = (rows[0].aiOutputJson ?? {}) as Record<string, unknown>;
      // 既に回答済なら上書きしない (誤クリック対策、再度の聞き出しを避ける)
      if (existing.feedback) return;
      await tx
        .update(aiSessions)
        .set({
          aiOutputJson: {
            ...existing,
            feedback: {
              outlookScore,
              submittedAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(aiSessions.id, sessionId));
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }
    logger.error({ event: 'ai_chat.today_plan.feedback_failed', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }

  logger.info({
    event: 'ai_chat.today_plan.feedback',
    session_id: sessionId,
    outlook_score: outlookScore,
  });

  return res.status(200).json({ ok: true });
}
