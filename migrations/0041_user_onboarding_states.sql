-- ============================================================
-- 0041: user_onboarding_states (初回コーチマーク等のオンボーディング状態)
--
-- 設計 (chimo 2026-05-16): 月曜の校長 → 教員「使ってみて」促し動線で、
-- AI 整理 (RoughCaptureSection) の初回利用時にコーチマークを出す。
-- 「閉じる」を押した教員には次回以降表示しない (押し付け感の排除)。
--
-- context は将来 'morning_plan' 等で横展開可能。state JSONB は context 別。
-- 現状 'ai_capture' のみ:
--   { dismissedAt: ISO?, completedStep: 1|2|3?, version: 'v1-2026-05-19' }
--
-- RLS 可視範囲: 0036_ai_sessions.sql と同じ厳格モード
--   ✅ 本人          (teacher で user_id = app_user_id() かつ tenant 一致)
--   ✅ system_admin  (集計・運用用、全件読取)
--   ❌ school_admin  (不可視 ← 教員のオンボーディング状態は校長/管理者に見せない)
--   ❌ 他テナント    (不可視)
-- 理由: feedback_observed_moment_broken.md (校長から教員の利用心理が見えると壊れる踏み絵)。
-- 「閉じる」を押した = 拒否動作と読まれる可能性があり、school_admin から見えると
-- 押し付け感が再生する。指標は集計済の AiCaptureCoachmarkDismissed event 経由で見る。
-- ============================================================

CREATE TABLE user_onboarding_states (
  user_id    UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  tenant_id  UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  context    TEXT         NOT NULL,
  state      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tenant_id, context)
);

CREATE INDEX user_onboarding_states_user_tenant_idx
  ON user_onboarding_states(user_id, tenant_id);

-- ============================================================
-- RLS ポリシー (school_admin 明示弾き、0036 ai_sessions と同型)
-- ============================================================

ALTER TABLE user_onboarding_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_onboarding_states FORCE ROW LEVEL SECURITY;

-- SELECT: system_admin + 本人 (school_admin は明示的に弾く)
CREATE POLICY user_onboarding_states_read ON user_onboarding_states
  FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN false
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- INSERT/UPDATE/DELETE: 本人のみ (system_admin は読取のみ、書込権限は与えない)
CREATE POLICY user_onboarding_states_write ON user_onboarding_states
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- ============================================================
-- 検証 (本番適用後に手動確認):
--   SET ROLE app_school_admin;
--   SET app.user_id = '<別教員の uuid>';
--   SET app.tenant_id = '<同テナントの uuid>';
--   SELECT * FROM user_onboarding_states;
--   → 0 行返ること (school_admin 不可視 = 踏み絵 OK)
-- ============================================================
