// User Onboarding States: 初回コーチマーク等の表示状態保存
// 入出力 Zod schemas。
//
// chimo 2026-05-20: H3 morning_plan は撤去 (project_h3_reframing_20260520)。
// 旧 'morning_plan_hint' / 'capacity_modal_default_hint' / 'plan_result_buttons_hint' /
// 'plan_result_start_hint' / 'today_plan_feedback_hint' / 'today_plan_done_hint' を削除。
// 'morning_card' は朝カード (H3-B 来訪価値仮説、 project_h3_morning_arrival_value)
// の dismiss 状態管理用に新規追加 (state は { dismissedDate: 'YYYY-MM-DD JST' })。
import { z } from 'zod';

export const onboardingContextSchema = z.enum([
  'ai_capture',
  'feedback_unread_hint',
  'morning_card',
]);
export type OnboardingContext = z.infer<typeof onboardingContextSchema>;

// 共通 schema: dismissedAt + version + step? の形で context 横断的に使う。
// step は ai_capture (3 ステップ overlay) 用。
export const aiCaptureOnboardingStateSchema = z.object({
  dismissedAt: z.string().datetime().optional(),
  completedStep: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  version: z.string().min(1),
});

export type AiCaptureOnboardingState = z.infer<typeof aiCaptureOnboardingStateSchema>;

// 朝カード dismiss 状態 (chimo 2026-05-20、 project_h3_morning_arrival_value)。
// dismissedDate は JST の YYYY-MM-DD。 翌朝以降は dismissedDate < today で再表示。
export const morningCardOnboardingStateSchema = z.object({
  dismissedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type MorningCardOnboardingState = z.infer<typeof morningCardOnboardingStateSchema>;
