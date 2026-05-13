-- ============================================================
-- 0039: ai_sessions / api_rate_limits の RLS policy 修正
--
-- 旧 policy (0036 / 0038) は school_admin を一律 false にしていたが、
-- school_admin も「自分自身の」 AI セッション・rate_limit を作る権利がある
-- (= school_admin も教員と同じく「タスクを整理する」を使える)。
--
-- 踏み絵 (project_ai_sessions_visibility.md) は「school_admin が他人の
-- ai_sessions を見ること」の禁止であって、「school_admin が自分の
-- ai_sessions を作ること」の禁止ではない。
-- user_id = app_user_id() の本人限定にすれば踏み絵セーフ + 機能利用可。
-- ============================================================

-- ── ai_sessions ──
DROP POLICY ai_sessions_read ON ai_sessions;
DROP POLICY ai_sessions_write ON ai_sessions;

CREATE POLICY ai_sessions_read ON ai_sessions
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

CREATE POLICY ai_sessions_write ON ai_sessions
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'school_admin' THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() = 'teacher'      THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL          THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'school_admin' THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() = 'teacher'      THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL          THEN false
      ELSE false
    END
  );

-- ── api_rate_limits ──
DROP POLICY api_rate_limits_read ON api_rate_limits;
DROP POLICY api_rate_limits_write ON api_rate_limits;

CREATE POLICY api_rate_limits_read ON api_rate_limits
  FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'system_admin' THEN true
      WHEN app_role() = 'school_admin' THEN user_id = app_user_id()
      WHEN app_role() = 'teacher'      THEN user_id = app_user_id()
      WHEN app_role() IS NULL          THEN false
      ELSE false
    END
  );

CREATE POLICY api_rate_limits_write ON api_rate_limits
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'school_admin' THEN user_id = app_user_id()
      WHEN app_role() = 'teacher'      THEN user_id = app_user_id()
      WHEN app_role() IS NULL          THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'school_admin' THEN user_id = app_user_id()
      WHEN app_role() = 'teacher'      THEN user_id = app_user_id()
      WHEN app_role() IS NULL          THEN false
      ELSE false
    END
  );
