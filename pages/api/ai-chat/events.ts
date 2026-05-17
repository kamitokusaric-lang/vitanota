// POST /api/ai-chat/events — AI 整理機能のクライアント発火イベントを構造化ログに流す。
//
// 用途: コーチマーク表示/前進/閉じる、textarea 初回入力など、サーバ側 endpoint を
// 経由しないユーザー行動を計測する。本 endpoint は副作用なし (DB 書込なし)、
// pure logging。
//
// 設計憲法 (feedback_observed_moment_broken.md / feedback_design_vocab.md):
//   全イベントを logEvent (info) で発火。warn は使わない (dismiss は正常動作)。
//
// 構造化ログの可視範囲: CloudWatch Logs (system_admin のみアクセス)。
// テナント別ダッシュボードへの露出は ai_sessions と同水準で school_admin 不可視。
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { LogEvents, logEvent } from '@/shared/lib/log-events';

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
    event: z.literal('morning_plan_hint_shown'),
    version: z.string().min(1),
  }),
  z.object({
    event: z.literal('morning_plan_hint_dismissed'),
    reason: z.enum(['close_button', 'cta_click']),
    version: z.string().min(1),
  }),
  z.object({
    event: z.literal('capacity_modal_default_hint_shown'),
    version: z.string().min(1),
  }),
  z.object({
    event: z.literal('capacity_modal_default_hint_dismissed'),
    reason: z.enum(['close_button', 'cta_click']),
    version: z.string().min(1),
  }),
  z.object({
    event: z.literal('plan_result_buttons_hint_shown'),
    version: z.string().min(1),
  }),
  z.object({
    event: z.literal('plan_result_buttons_hint_dismissed'),
    reason: z.enum(['close_button', 'cta_click']),
    version: z.string().min(1),
  }),
  z.object({
    event: z.literal('plan_result_start_hint_shown'),
    version: z.string().min(1),
  }),
  z.object({
    event: z.literal('plan_result_start_hint_dismissed'),
    reason: z.enum(['close_button', 'cta_click']),
    version: z.string().min(1),
  }),
  z.object({
    event: z.literal('today_plan_feedback_hint_shown'),
    version: z.string().min(1),
  }),
  z.object({
    event: z.literal('today_plan_feedback_hint_dismissed'),
    reason: z.enum(['close_button', 'cta_click']),
    version: z.string().min(1),
  }),
  z.object({
    event: z.literal('today_plan_done_hint_shown'),
    version: z.string().min(1),
  }),
  z.object({
    event: z.literal('today_plan_done_hint_dismissed'),
    reason: z.enum(['close_button', 'cta_click']),
    version: z.string().min(1),
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
    case 'morning_plan_hint_shown':
      logEvent(LogEvents.MorningPlanHintShown, {
        ...base,
        version: parsed.data.version,
      });
      break;
    case 'morning_plan_hint_dismissed':
      logEvent(LogEvents.MorningPlanHintDismissed, {
        ...base,
        reason: parsed.data.reason,
        version: parsed.data.version,
      });
      break;
    case 'capacity_modal_default_hint_shown':
      logEvent(LogEvents.CapacityModalDefaultHintShown, {
        ...base,
        version: parsed.data.version,
      });
      break;
    case 'capacity_modal_default_hint_dismissed':
      logEvent(LogEvents.CapacityModalDefaultHintDismissed, {
        ...base,
        reason: parsed.data.reason,
        version: parsed.data.version,
      });
      break;
    case 'plan_result_buttons_hint_shown':
      logEvent(LogEvents.PlanResultButtonsHintShown, {
        ...base,
        version: parsed.data.version,
      });
      break;
    case 'plan_result_buttons_hint_dismissed':
      logEvent(LogEvents.PlanResultButtonsHintDismissed, {
        ...base,
        reason: parsed.data.reason,
        version: parsed.data.version,
      });
      break;
    case 'plan_result_start_hint_shown':
      logEvent(LogEvents.PlanResultStartHintShown, {
        ...base,
        version: parsed.data.version,
      });
      break;
    case 'plan_result_start_hint_dismissed':
      logEvent(LogEvents.PlanResultStartHintDismissed, {
        ...base,
        reason: parsed.data.reason,
        version: parsed.data.version,
      });
      break;
    case 'today_plan_feedback_hint_shown':
      logEvent(LogEvents.TodayPlanFeedbackHintShown, {
        ...base,
        version: parsed.data.version,
      });
      break;
    case 'today_plan_feedback_hint_dismissed':
      logEvent(LogEvents.TodayPlanFeedbackHintDismissed, {
        ...base,
        reason: parsed.data.reason,
        version: parsed.data.version,
      });
      break;
    case 'today_plan_done_hint_shown':
      logEvent(LogEvents.TodayPlanDoneHintShown, {
        ...base,
        version: parsed.data.version,
      });
      break;
    case 'today_plan_done_hint_dismissed':
      logEvent(LogEvents.TodayPlanDoneHintDismissed, {
        ...base,
        reason: parsed.data.reason,
        version: parsed.data.version,
      });
      break;
  }

  return res.status(204).end();
}
