// POST /api/ai-chat/events — クライアント発火イベントを構造化ログに流す + 集計用 DB に書き込み。
//
// 用途: コーチマーク表示/前進/閉じる、 textarea 初回入力、 カレンダーの教員操作など、
// サーバ側 endpoint を経由しないユーザー行動を計測する。
//
// 副作用方針 (chimo 2026-05-30 更新):
//   - 全イベント: 構造化ログ (logEvent info、 CloudWatch、 system_admin のみアクセス) に流す
//   - calendar_* のみ: 集計用に calendar_events テーブルへも INSERT
//     (best effort、 INSERT 失敗は静かに無視 = ユーザー体験を絶対に止めない)
//
// 設計憲法 (feedback_observed_moment_broken.md / feedback_design_vocab.md):
//   全イベントを logEvent (info) で発火。 warn は使わない。
//
// 構造化ログ + DB の可視範囲: ai_sessions と同水準で school_admin 不可視。
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { calendarEvents } from '@/db/schema';
import { LogEvents, logEvent } from '@/shared/lib/log-events';
import { logger } from '@/shared/lib/logger';

const CALENDAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CALENDAR_EVENT_VERSION = 'calendar-v1';

const RequestSchema = z.discriminatedUnion('event', [
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
  // カレンダー機能 (Unit-06) の利用計測 (chimo 2026-05-30)。
  // version は client から送らず server 側で定数付与。
  z.object({
    event: z.literal('calendar_view_switched'),
    view: z.enum(['board', 'calendar']),
  }),
  z.object({
    event: z.literal('calendar_task_moved'),
    taskId: z.string().guid(),
    fromDate: z.string().regex(CALENDAR_DATE_RE).nullable(),
    toDate: z.string().regex(CALENDAR_DATE_RE),
  }),
  z.object({
    event: z.literal('calendar_task_pushed_to_next_week'),
    taskId: z.string().guid(),
    fromDate: z.string().regex(CALENDAR_DATE_RE).nullable(),
    toDate: z.string().regex(CALENDAR_DATE_RE),
  }),
  z.object({
    event: z.literal('calendar_task_created_from_plus'),
    date: z.string().regex(CALENDAR_DATE_RE),
    taskId: z.string().guid(),
  }),
  z.object({
    event: z.literal('calendar_day_detail_opened'),
    date: z.string().regex(CALENDAR_DATE_RE),
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
      message: parsed.error.issues[0]?.message ?? '入力が不正です',
    });
  }

  const base = { userId: ctx.userId, tenantId: ctx.tenantId };
  switch (parsed.data.event) {
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
    case 'calendar_view_switched':
      logEvent(LogEvents.CalendarViewSwitched, {
        ...base,
        version: CALENDAR_EVENT_VERSION,
        view: parsed.data.view,
      });
      await persistCalendarEvent(ctx, 'view_switched', {
        view: parsed.data.view,
      });
      break;
    case 'calendar_task_moved':
      logEvent(LogEvents.CalendarTaskMoved, {
        ...base,
        version: CALENDAR_EVENT_VERSION,
        taskId: parsed.data.taskId,
        fromDate: parsed.data.fromDate,
        toDate: parsed.data.toDate,
      });
      await persistCalendarEvent(ctx, 'task_moved', {
        taskId: parsed.data.taskId,
        fromDate: parsed.data.fromDate,
        toDate: parsed.data.toDate,
      });
      break;
    case 'calendar_task_pushed_to_next_week':
      logEvent(LogEvents.CalendarTaskPushedToNextWeek, {
        ...base,
        version: CALENDAR_EVENT_VERSION,
        taskId: parsed.data.taskId,
        fromDate: parsed.data.fromDate,
        toDate: parsed.data.toDate,
      });
      await persistCalendarEvent(ctx, 'task_pushed_to_next_week', {
        taskId: parsed.data.taskId,
        fromDate: parsed.data.fromDate,
        toDate: parsed.data.toDate,
      });
      break;
    case 'calendar_task_created_from_plus':
      logEvent(LogEvents.CalendarTaskCreatedFromPlus, {
        ...base,
        version: CALENDAR_EVENT_VERSION,
        date: parsed.data.date,
        taskId: parsed.data.taskId,
      });
      await persistCalendarEvent(ctx, 'task_created_from_plus', {
        date: parsed.data.date,
        taskId: parsed.data.taskId,
      });
      break;
    case 'calendar_day_detail_opened':
      logEvent(LogEvents.CalendarDayDetailOpened, {
        ...base,
        version: CALENDAR_EVENT_VERSION,
        date: parsed.data.date,
      });
      await persistCalendarEvent(ctx, 'day_detail_opened', {
        date: parsed.data.date,
      });
      break;
  }

  return res.status(204).end();
}

// best effort: calendar event を集計用テーブルに INSERT。
// 失敗してもユーザー体験を止めない (= 構造化ログには既に流れている)。
// RLS で本人のみ書込可、 withTenantUser でロールセットして INSERT。
// version は calendar に概念が無いため一律 CALENDAR_EVENT_VERSION を入れる。
type CalendarEventCtx = NonNullable<Awaited<ReturnType<typeof requireAuth>>>;
type CalendarEventType =
  | 'view_switched'
  | 'task_moved'
  | 'task_pushed_to_next_week'
  | 'task_created_from_plus'
  | 'day_detail_opened';

async function persistCalendarEvent(
  ctx: CalendarEventCtx,
  eventType: CalendarEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const role = pickDbRole(ctx);
    await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      await tx.insert(calendarEvents).values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        eventType,
        version: CALENDAR_EVENT_VERSION,
        payload,
      });
    });
  } catch (err) {
    logger.warn(
      {
        event: 'calendar_event.persist_failed',
        eventType,
        err: err instanceof Error ? err.message : String(err),
      },
      'calendar_event persist failed (best effort)',
    );
  }
}
