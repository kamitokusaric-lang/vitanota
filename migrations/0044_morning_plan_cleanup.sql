-- ============================================================
-- 0044: morning_plan 機能撤去に伴う schema / data cleanup
--
-- 設計 (chimo 2026-05-20、project_h3_reframing_20260520):
-- H3 morning_plan 機能を丸ごと削除。 既存 today_plan_items テーブル + 関連
-- onboarding state を cleanup する。
--
-- 保持するもの (cleanup しない):
--   - ai_sessions の type='morning_plan' 行 → 履歴として残す (chimo 確認済)
--   - api_rate_limits の endpoint='ai_chat_morning_plan' 行 → 共通テーブル、 害なし
--
-- ロールバック: 0040_today_plan_items.sql の CREATE TABLE を再実行すれば復活可、
-- ただしデータは失われる (今回の削除で消える)。
-- ============================================================

-- 1. today_plan_items テーブルを drop (関連 index + RLS policy も CASCADE で削除)
DROP TABLE IF EXISTS today_plan_items CASCADE;

-- 2. user_onboarding_states から morning_plan 関連の row を削除
-- src/schemas/userOnboardingStates.ts の onboardingContextSchema からも同じ値を削除済
DELETE FROM user_onboarding_states
WHERE context IN (
  'morning_plan_hint',
  'capacity_modal_default_hint',
  'plan_result_buttons_hint',
  'plan_result_start_hint',
  'today_plan_feedback_hint',
  'today_plan_done_hint'
);
