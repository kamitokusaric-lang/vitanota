// POST /api/ai-chat/today-plan/done — 今日のプランから Done / undone する。
//
// done: tasks.status='done' + today_plan_items.done_at=NOW()
// undone: tasks.status='todo' + today_plan_items.done_at=NULL
// レスポンス: { ok, todayDoneCount } — toast 「N つ進みました」の N に使う

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { tasks, todayPlanItems } from '@/db/schema';
import { logger } from '@/shared/lib/logger';
import { isAiChatEnabledForTenant } from '@/features/ai-chat/featureFlag';

const RequestSchema = z.object({
  sessionId: z.string().uuid(),
  taskId: z.string().uuid(),
  action: z.enum(['done', 'undone']),
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

  const { sessionId, taskId, action } = parsed.data;
  const role = pickDbRole(ctx);

  let todayDoneCount = 0;
  try {
    todayDoneCount = await withTenantUser(
      ctx.tenantId,
      ctx.userId,
      role,
      async (tx) => {
        // RLS で他人のタスクは弾かれる
        if (action === 'done') {
          await tx
            .update(tasks)
            .set({
              status: 'done',
              completedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, ctx.tenantId)));

          await tx
            .update(todayPlanItems)
            .set({ doneAt: new Date(), updatedAt: new Date() })
            .where(
              and(
                eq(todayPlanItems.sessionId, sessionId),
                eq(todayPlanItems.taskId, taskId),
                eq(todayPlanItems.userId, ctx.userId),
              ),
            );
        } else {
          // undone: tasks.status を todo に戻す + done_at リセット
          await tx
            .update(tasks)
            .set({
              status: 'todo',
              completedAt: null,
              updatedAt: new Date(),
            })
            .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, ctx.tenantId)));

          await tx
            .update(todayPlanItems)
            .set({ doneAt: null, updatedAt: new Date() })
            .where(
              and(
                eq(todayPlanItems.sessionId, sessionId),
                eq(todayPlanItems.taskId, taskId),
                eq(todayPlanItems.userId, ctx.userId),
              ),
            );
        }

        // 今日プラン経由の done 件数を再計算 (= toast 「N つ進みました」用)
        const countResult = await tx.execute<{ count: number }>(sql`
          SELECT COUNT(*)::int AS count
          FROM today_plan_items
          WHERE session_id = ${sessionId}::uuid
            AND user_id = ${ctx.userId}::uuid
            AND done_at IS NOT NULL
        `);
        return countResult.rows[0]?.count ?? 0;
      },
    );
  } catch (err) {
    logger.error({
      event: 'ai_chat.today_plan.done_failed',
      err,
      action,
    });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }

  logger.info({
    event: 'ai_chat.today_plan.done',
    session_id: sessionId,
    task_id: taskId,
    action,
    today_done_count: todayDoneCount,
  });

  return res.status(200).json({ ok: true, todayDoneCount });
}
