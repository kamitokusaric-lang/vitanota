// POST /api/ai-chat/feedback — AI 整理後の任意フィードバック (編集理由) を保存。
//
// 2026-05-14: 「整理されましたか？」スコア (organizeScore / inputBurdenScore) UI を撤去。
// schema は optional のまま残し、過去データとの互換性を維持。新規送信は editReason のみ。
// ai_sessions.ai_output_json に追記する形で永続化 (school_admin 不可視)。

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { aiSessions } from '@/db/schema';
import { isAiChatEnabledForTenant } from '@/features/ai-chat/featureFlag';
import { logger } from '@/shared/lib/logger';

const EDIT_REASONS = [
  'wrong_candidate',
  'too_detailed',
  'too_rough',
  'not_a_task',
  'inconvenient',
  'privacy_concern',
  'other',
] as const;

const RequestSchema = z.object({
  sessionId: z.string().guid(),
  organizeScore: z.number().int().min(1).max(5).optional(),
  inputBurdenScore: z.number().int().min(1).max(5).optional(),
  editReason: z.enum(EDIT_REASONS).optional(),
  editReasonText: z.string().max(500).optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
      message: parsed.error.issues[0]?.message ?? '入力が不正です',
    });
  }

  const role = pickDbRole(ctx);
  const body = parsed.data;

  try {
    await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      const rows = await tx
        .select()
        .from(aiSessions)
        .where(
          and(eq(aiSessions.id, body.sessionId), eq(aiSessions.userId, ctx.userId)),
        );
      if (rows.length === 0) {
        throw new Error('SESSION_NOT_FOUND');
      }
      const existingOutput = (rows[0].aiOutputJson ?? {}) as Record<string, unknown>;
      await tx
        .update(aiSessions)
        .set({
          aiOutputJson: {
            ...existingOutput,
            ...(body.organizeScore != null
              ? {
                  survey: {
                    organizeScore: body.organizeScore,
                    inputBurdenScore: body.inputBurdenScore ?? null,
                    submittedAt: new Date().toISOString(),
                  },
                }
              : {}),
            ...(body.editReason
              ? {
                  editReason: body.editReason,
                  editReasonText:
                    body.editReason === 'other'
                      ? body.editReasonText ?? null
                      : null,
                  editReasonAt: new Date().toISOString(),
                }
              : {}),
          },
          updatedAt: new Date(),
        })
        .where(eq(aiSessions.id, body.sessionId));
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }
    logger.error({ event: 'ai_chat.feedback_failed', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }

  logger.info({
    event: 'ai_chat.feedback_submitted',
    session_id: body.sessionId,
    organize_score: body.organizeScore ?? null,
    input_burden_score: body.inputBurdenScore ?? null,
    edit_reason: body.editReason ?? null,
  });

  return res.status(200).json({ ok: true });
}
