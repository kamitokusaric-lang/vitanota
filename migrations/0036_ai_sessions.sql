-- ============================================================
-- 0036: ai_sessions (AI 整理機能の中間状態保持)
--
-- 設計: project_ai_sessions_visibility.md (2026-05-12 chimo)
-- 教員のチャット入力 + AI 出力 + 取捨選択を一時保持。教員が確認・採用
-- したものだけ tasks / journal_entries に保存される。中間状態を本人 +
-- system_admin のみ可視に閉じる (school_admin 不可視 = 踏み絵)。
--
-- RLS 可視範囲 (feedback_observed_moment_broken.md 踏み絵):
--   ✅ 本人      (teacher で user_id = app_user_id() かつ tenant 一致)
--   ✅ system_admin (集計用、全件読取)
--   ❌ school_admin (不可視 ← 教員の中間状態は他者に見せない)
--   ❌ 他テナント   (不可視)
--
-- 構造化ログ方針:
--   input_text / ai_output_json を構造化ログに流さない (個人情報混入前提)。
--   構造化ログは event 名 + type + user_id のみ。
-- ============================================================

CREATE TYPE ai_session_type AS ENUM ('quick_capture', 'morning_plan', 'daily_wrap');
CREATE TYPE ai_session_status AS ENUM ('draft', 'confirmed', 'discarded');

CREATE TABLE ai_sessions (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID              NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            ai_session_type   NOT NULL DEFAULT 'quick_capture',
  input_text      TEXT              NOT NULL,
  ai_output_json  JSONB             NOT NULL DEFAULT '{}'::jsonb,
  status          ai_session_status NOT NULL DEFAULT 'draft',
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX ai_sessions_user_idx ON ai_sessions(user_id, created_at DESC);
CREATE INDEX ai_sessions_tenant_idx ON ai_sessions(tenant_id);

ALTER TABLE ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_sessions FORCE ROW LEVEL SECURITY;

-- SELECT: system_admin + 本人 (school_admin は明示的に弾く)
CREATE POLICY ai_sessions_read ON ai_sessions
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
CREATE POLICY ai_sessions_write ON ai_sessions
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
