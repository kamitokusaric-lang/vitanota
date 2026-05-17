-- ============================================================
-- 0043: school_admin self-row RLS 修正
--
-- 背景 (chimo 2026-05-17): 本番デプロイ後、school_admin で:
--   - user_onboarding_states INSERT が WITH CHECK 違反で失敗
--     → ダッシュボードの各ヒント dismiss が動かない
--   - feedback_replies SELECT が 0 行 = 「返信が届かない」
--     → 校長兼教員が自分のフィードバックへの返信を読めない
--
-- 修正方針: 「school_admin も一人の先生」 = 自分の行は読み書きできる。
--   他人の行は引き続き不可 (踏み絵 feedback_observed_moment_broken)。
--
-- 影響テーブル:
--   - user_onboarding_states (0041): SELECT/INSERT/UPDATE で school_admin self-row 許可
--   - feedback_replies (0042):       SELECT で school_admin self-submission 許可
-- ============================================================

-- ── user_onboarding_states: school_admin が自分の行を読み書きできるように ──
DROP POLICY IF EXISTS user_onboarding_states_read  ON user_onboarding_states;
DROP POLICY IF EXISTS user_onboarding_states_write ON user_onboarding_states;

-- SELECT: system_admin 全件 / school_admin & teacher は自分の行のみ
-- 注: school_admin が他教員の onboarding 状態を見るのは踏み絵で不可 (= 自分の行のみに制限)
CREATE POLICY user_onboarding_states_read ON user_onboarding_states
  FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'system_admin' THEN true
      WHEN app_role() = 'school_admin' THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() = 'teacher'      THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL          THEN false
      ELSE false
    END
  );

-- INSERT/UPDATE/DELETE: school_admin / teacher 共に自分の行のみ
CREATE POLICY user_onboarding_states_write ON user_onboarding_states
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'teacher'      THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() = 'school_admin' THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL          THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'teacher'      THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() = 'school_admin' THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL          THEN false
      ELSE false
    END
  );

-- ── feedback_replies: school_admin が自分の submission への返信を読めるように ──
-- (school_admin 兼教員が自分のフィードバックの返信を読む動線、踏み絵的に OK = 自分の行)
DROP POLICY IF EXISTS feedback_replies_read ON feedback_replies;

CREATE POLICY feedback_replies_read ON feedback_replies
  FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'system_admin' THEN true
      WHEN app_role() = 'school_admin' THEN
        submitter_user_id = app_user_id() AND tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'      THEN
        submitter_user_id = app_user_id() AND tenant_id = app_tenant_id()
      WHEN app_role() IS NULL          THEN false
      ELSE false
    END
  );

-- ============================================================
-- 検証 (本番適用後):
--   SET ROLE app_school_admin;
--   SET app.user_id = '<chimo の id>'; SET app.tenant_id = '<chimo の tenant>';
--   SELECT * FROM feedback_replies;  -- chimo 自身の submission への reply のみ
--   SELECT * FROM user_onboarding_states;  -- chimo 自身の state のみ
--
--   SET app.user_id = '<別教員>';
--   SELECT * FROM feedback_replies;  -- 0 行 (踏み絵維持)
-- ============================================================
