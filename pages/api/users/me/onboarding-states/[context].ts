// GET / PUT user_onboarding_states (context='ai_capture' 等)
//
// GET  → { state: AiCaptureOnboardingState | null }
//   未保存の教員は state=null、コーチマーク表示判定はクライアント側 hook で行う
// PUT  → { ok: true }
//   body は AiCaptureOnboardingState (Zod 検証)、UPSERT で 1 行のみ保持
//
// RLS: user_onboarding_states の write ポリシーで本人 only を物理保証
// 認証: requireAuth (teacher / school_admin)
// 注: school_admin が PUT した場合 RLS write ポリシーで弾かれる (本人 only)。
//     本機能では school_admin がオンボーディング状態を持つことは想定しないが、
//     誤って叩かれた場合は 0 行 update で no-op 終了する (DB 側で安全)。
import type { NextApiRequest, NextApiResponse } from 'next';
import { and, eq } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { userOnboardingStates } from '@/db/schema';
import {
  aiCaptureOnboardingStateSchema,
  onboardingContextSchema,
} from '@/schemas/userOnboardingStates';
import { logger } from '@/shared/lib/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  // path param 検証
  const contextParam = onboardingContextSchema.safeParse(req.query.context);
  if (!contextParam.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'context が不正です',
    });
  }
  const context = contextParam.data;

  if (req.method === 'GET') {
    const rows = await withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) =>
        tx
          .select()
          .from(userOnboardingStates)
          .where(
            and(
              eq(userOnboardingStates.userId, ctx.userId),
              eq(userOnboardingStates.tenantId, ctx.tenantId),
              eq(userOnboardingStates.context, context),
            ),
          )
          .limit(1),
    );
    return res.status(200).json({
      state: rows[0]?.state ?? null,
    });
  }

  if (req.method === 'PUT') {
    // context 別に schema を分岐する余地を残しつつ、現状は ai_capture のみ
    const parsed = aiCaptureOnboardingStateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? '入力が不正です',
      });
    }

    await withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        await tx
          .insert(userOnboardingStates)
          .values({
            userId: ctx.userId,
            tenantId: ctx.tenantId,
            context,
            state: parsed.data,
          })
          .onConflictDoUpdate({
            target: [
              userOnboardingStates.userId,
              userOnboardingStates.tenantId,
              userOnboardingStates.context,
            ],
            set: {
              state: parsed.data,
              updatedAt: new Date(),
            },
          });
      },
    );

    // dismiss は正常動作 (logger.warn ではなく info)。
    // observed_moment_broken 踏み絵: 「閉じる」を負シグナル扱いしない。
    logger.info({
      event: 'user_onboarding_state.upserted',
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      context,
      dismissed: Boolean(parsed.data.dismissedAt),
      completedStep: parsed.data.completedStep ?? null,
      version: parsed.data.version,
    });

    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).end();
}
