// POST /api/ai-chat/events — クライアント発火イベントを構造化ログに流す + 集計用 DB に書き込み。
//
// 用途: コーチマーク表示/前進/閉じる、 textarea 初回入力、 朝カードの教員行動など、
// サーバ側 endpoint を経由しないユーザー行動を計測する。
//
// 副作用方針 (chimo 2026-05-20 拡張):
//   - 全イベント: 構造化ログ (logEvent info、 CloudWatch、 system_admin のみアクセス) に流す
//   - morning_card_* のみ: 集計用に morning_card_events テーブルへも INSERT
//     (best effort、 INSERT 失敗は静かに無視 = ユーザー体験を絶対に止めない)
//
// 設計憲法 (feedback_observed_moment_broken.md / feedback_design_vocab.md):
//   全イベントを logEvent (info) で発火。 warn は使わない (dismiss は正常動作)。
//
// 構造化ログ + DB の可視範囲: ai_sessions と同水準で school_admin 不可視。
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { morningCardEvents } from '@/db/schema';
import { LogEvents, logEvent } from '@/shared/lib/log-events';
import { logger } from '@/shared/lib/logger';

const RequestSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('ai_capture_coachmark_shown'),
    version: z.string().min(1),
  }),
  z.object({
    event: z.literal('ai_capture_coachmark_advanced'),
    step: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    version: z.string().min(1),
  }),
  z.object({
    event: z.literal('ai_capture_coachmark_dismissed'),
    step: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    reason: z.enum(['skip', 'completed', 'outside_click']),
    version: z.string().min(1),
  }),
  z.object({
    event: z.literal('ai_capture_input_started'),
    source: z.literal('rough_capture'),
  }),
  z.object({
    event: z.literal('feedback_unread_hint_shown'),
    version: z.string().min(1),
  }),
  z.object({
    event: z.literal('feedback_unread_hint_dismissed'),
    reason: z.enum(['close_button', 'cta_click']),
    version: z.string().min(1),
  }),
  // H3-B 朝カード (chimo 2026-05-20)
  z.object({
    event: z.literal('morning_card_shown'),
    version: z.string().min(1),
    candidateCount: z.number().int().min(0),
    overdueCount: z.number().int().min(0),
    todayDueCount: z.number().int().min(0),
    noDueDateCount: z.number().int().min(0),
    yesterdayDoneCount: z.number().int().min(0),
  }),
  z.object({
    event: z.literal('morning_card_dismissed'),
    version: z.string().min(1),
  }),
  z.object({
    event: z.literal('morning_card_candidate_clicked'),
    version: z.string().min(1),
    position: z.number().int().min(1),
    urgency: z.enum([
      'overdue',
      'today',
      'soon',
      'in_progress',
      'no_due_date',
      'other',
    ]),
  }),
  z.object({
    event: z.literal('morning_card_candidate_status_changed'),
    version: z.string().min(1),
    position: z.number().int().min(1),
    urgency: z.enum([
      'overdue',
      'today',
      'soon',
      'in_progress',
      'no_due_date',
      'other',
    ]),
    from: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done']),
    to: z.enum(['backlog', 'todo', 'in_progress', 'review', 'done']),
  }),
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }

  const base = { userId: ctx.userId, tenantId: ctx.tenantId };
  switch (parsed.data.event) {
    case 'ai_capture_coachmark_shown':
      logEvent(LogEvents.AiCaptureCoachmarkShown, {
        ...base,
        version: parsed.data.version,
      });
      break;
    case 'ai_capture_coachmark_advanced':
      logEvent(LogEvents.AiCaptureCoachmarkAdvanced, {
        ...base,
        step: parsed.data.step,
        version: parsed.data.version,
      });
      break;
    case 'ai_capture_coachmark_dismissed':
      logEvent(LogEvents.AiCaptureCoachmarkDismissed, {
        ...base,
        step: parsed.data.step,
        reason: parsed.data.reason,
        version: parsed.data.version,
      });
      break;
    case 'ai_capture_input_started':
      logEvent(LogEvents.AiCaptureInputStarted, {
        ...base,
        source: parsed.data.source,
      });
      break;
    case 'feedback_unread_hint_shown':
      logEvent(LogEvents.FeedbackUnreadHintShown, {
        ...base,
        version: parsed.data.version,
      });
      break;
    case 'feedback_unread_hint_dismissed':
      logEvent(LogEvents.FeedbackUnreadHintDismissed, {
        ...base,
        reason: parsed.data.reason,
        version: parsed.data.version,
      });
      break;
    case 'morning_card_shown':
      logEvent(LogEvents.MorningCardShown, {
        ...base,
        version: parsed.data.version,
        candidateCount: parsed.data.candidateCount,
        overdueCount: parsed.data.overdueCount,
        todayDueCount: parsed.data.todayDueCount,
        noDueDateCount: parsed.data.noDueDateCount,
        yesterdayDoneCount: parsed.data.yesterdayDoneCount,
      });
      await persistMorningCardEvent(ctx, 'shown', parsed.data.version, {
        candidateCount: parsed.data.candidateCount,
        overdueCount: parsed.data.overdueCount,
        todayDueCount: parsed.data.todayDueCount,
        noDueDateCount: parsed.data.noDueDateCount,
        yesterdayDoneCount: parsed.data.yesterdayDoneCount,
      });
      break;
    case 'morning_card_dismissed':
      logEvent(LogEvents.MorningCardDismissed, {
        ...base,
        version: parsed.data.version,
      });
      await persistMorningCardEvent(ctx, 'dismissed', parsed.data.version, {});
      break;
    case 'morning_card_candidate_clicked':
      logEvent(LogEvents.MorningCardCandidateClicked, {
        ...base,
        version: parsed.data.version,
        position: parsed.data.position,
        urgency: parsed.data.urgency,
      });
      await persistMorningCardEvent(
        ctx,
        'candidate_clicked',
        parsed.data.version,
        {
          position: parsed.data.position,
          urgency: parsed.data.urgency,
        },
      );
      break;
    case 'morning_card_candidate_status_changed':
      logEvent(LogEvents.MorningCardCandidateStatusChanged, {
        ...base,
        version: parsed.data.version,
        position: parsed.data.position,
        urgency: parsed.data.urgency,
        from: parsed.data.from,
        to: parsed.data.to,
      });
      await persistMorningCardEvent(
        ctx,
        'candidate_status_changed',
        parsed.data.version,
        {
          position: parsed.data.position,
          urgency: parsed.data.urgency,
          from: parsed.data.from,
          to: parsed.data.to,
        },
      );
      break;
  }

  return res.status(204).end();
}

// best effort: 朝カード event を集計用テーブルに INSERT。
// 失敗してもユーザー体験を止めない (= 構造化ログには既に流れている)。
// RLS で本人のみ書込可、 withTenantUser でロールセットして INSERT。
type MorningCardEventCtx = NonNullable<Awaited<ReturnType<typeof requireAuth>>>;
type MorningCardEventType =
  | 'shown'
  | 'dismissed'
  | 'candidate_clicked'
  | 'candidate_status_changed';

async function persistMorningCardEvent(
  ctx: MorningCardEventCtx,
  eventType: MorningCardEventType,
  version: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const role = pickDbRole(ctx);
    await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      await tx.insert(morningCardEvents).values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        eventType,
        version,
        payload,
      });
    });
  } catch (err) {
    logger.warn(
      {
        event: 'morning_card_event.persist_failed',
        eventType,
        err: err instanceof Error ? err.message : String(err),
      },
      'morning_card_event persist failed (best effort)',
    );
  }
}
