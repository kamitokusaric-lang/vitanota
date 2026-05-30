// User Onboarding States: 初回コーチマーク等の表示状態保存
// 入出力 Zod schemas。
//
// chimo 2026-05-20: H3 morning_plan は撤去 (project_h3_reframing_20260520)。
// 旧 'morning_plan_hint' / 'capacity_modal_default_hint' / 'plan_result_buttons_hint' /
// 'plan_result_start_hint' / 'today_plan_feedback_hint' / 'today_plan_done_hint' を削除。
// chimo 2026-05-30: 朝カード (H3-B) 撤去に伴い 'morning_card' context も削除
// (役割を calendar に統合、 migration 0048 で dismiss row も削除)。
import { z } from 'zod';

export const onboardingContextSchema = z.enum([
  'ai_capture',
  'feedback_unread_hint',
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
