// User Onboarding States: 初回コーチマーク等の表示状態保存
// 入出力 Zod schemas。
//
// context='ai_capture' の state 構造を定義 (将来 'morning_plan' 等が増えたら別 schema)。
import { z } from 'zod';

export const onboardingContextSchema = z.enum([
  'ai_capture',
  'morning_plan_hint',
  'capacity_modal_default_hint',
  'plan_result_buttons_hint',
  'plan_result_start_hint',
  'today_plan_feedback_hint',
  'today_plan_done_hint',
]);
export type OnboardingContext = z.infer<typeof onboardingContextSchema>;

// 共通 schema: dismissedAt + version + step? の形で context 横断的に使う。
// step は ai_capture (3 ステップ overlay) 用、morning_plan_hint では undefined。
export const aiCaptureOnboardingStateSchema = z.object({
  dismissedAt: z.string().datetime().optional(),
  completedStep: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  version: z.string().min(1),
});

export type AiCaptureOnboardingState = z.infer<typeof aiCaptureOnboardingStateSchema>;
