// GET / PUT user_filter_preferences (context='tasks')
//
// GET  → { preference: TaskFilterSettings | null }
//   未保存の教員は preference=null、TaskBoard はシステム初期値を使う
// PUT  → { ok: true }
//   body は TaskFilterSettings (Zod 検証)、UPSERT で 1 行のみ保持
//
// RLS: user_filter_preferences の write ポリシーで本人 only を物理保証
// 認証: requireAuth (teacher / school_admin)
import type { NextApiRequest, NextApiResponse } from 'next';
import { and, eq } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { userFilterPreferences } from '@/db/schema';
import { taskFilterSettingsSchema } from '@/schemas/userFilterPreferences';
import { logger } from '@/shared/lib/logger';

const CONTEXT = 'tasks';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method === 'GET') {
    const rows = await withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) =>
        tx
          .select()
          .from(userFilterPreferences)
          .where(
            and(
              eq(userFilterPreferences.userId, ctx.userId),
              eq(userFilterPreferences.tenantId, ctx.tenantId),
              eq(userFilterPreferences.context, CONTEXT),
            ),
          )
          .limit(1),
    );
    return res.status(200).json({
      preference: rows[0]?.settings ?? null,
    });
  }

  if (req.method === 'PUT') {
    const parsed = taskFilterSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.errors[0]?.message ?? '入力が不正です',
      });
    }

    await withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        await tx
          .insert(userFilterPreferences)
          .values({
            userId: ctx.userId,
            tenantId: ctx.tenantId,
            context: CONTEXT,
            settings: parsed.data,
          })
          .onConflictDoUpdate({
            target: [
              userFilterPreferences.userId,
              userFilterPreferences.tenantId,
              userFilterPreferences.context,
            ],
            set: {
              settings: parsed.data,
              updatedAt: new Date(),
            },
          });
      },
    );

    logger.info({
      event: 'user_filter_preference.upserted',
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      context: CONTEXT,
    });

    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).end();
}
