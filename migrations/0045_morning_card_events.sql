-- ============================================================
-- 0045: morning_card_events (H3-B 朝カードの教員行動ログ)
--
-- 設計 (chimo 2026-05-20):
--   project_h3_morning_arrival_value 朝カード (来訪価値仮説) の利用計測。
--   構造化ログだけだとクエリが重いため、 集計用に DB に永続化。
--   /admin/access-distribution でヒートマップ + Summary 表示する。
--
-- RLS 可視範囲 (ai_sessions と同水準、 feedback_observed_moment_broken 踏み絵):
--   ✅ 本人          (teacher で user_id = app_user_id() かつ tenant 一致)
--   ✅ system_admin   (集計用、 全件読取)
--   ❌ school_admin   (不可視 ← 教員の動きを他者に見せない)
--   ❌ 他テナント     (不可視)
--
-- 書込:
--   - teacher 本人が自分の event を INSERT (= クライアント発火時 /api/ai-chat/events 経由)
--   - system_admin は読取のみ (書込権限を与えない、 ai_sessions と同じ)
--
-- ロールバック: DROP TABLE morning_card_events; DROP TYPE morning_card_event_type;
-- ============================================================

CREATE TYPE morning_card_event_type AS ENUM (
  'shown',
  'dismissed',
  'candidate_clicked',
  'candidate_status_changed'
);

CREATE TABLE morning_card_events (
  id          UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID                     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID                     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type  morning_card_event_type  NOT NULL,
  version     VARCHAR(32)              NOT NULL,
  payload     JSONB                    NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ              NOT NULL DEFAULT NOW()
);

CREATE INDEX morning_card_events_tenant_created_idx
  ON morning_card_events(tenant_id, created_at DESC);
CREATE INDEX morning_card_events_type_created_idx
  ON morning_card_events(event_type, created_at DESC);
CREATE INDEX morning_card_events_user_idx
  ON morning_card_events(user_id, created_at DESC);

ALTER TABLE morning_card_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE morning_card_events FORCE ROW LEVEL SECURITY;

-- SELECT: system_admin + 本人 (school_admin は明示的に弾く)
CREATE POLICY morning_card_events_read ON morning_card_events
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

-- INSERT/UPDATE/DELETE: 本人のみ (system_admin は読取のみ)
CREATE POLICY morning_card_events_write ON morning_card_events
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
