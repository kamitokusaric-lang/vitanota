-- ============================================================
-- 0047: calendar_events (カレンダー機能 Unit-06 の教員行動ログ)
--
-- 設計 (chimo 2026-05-30):
--   calendar MVP (Unit-06) 投入後の利用計測。 新 H3 仮説
--   (週/月の偏り把握 + calendar が朝の来訪価値を代替できるか) の検証データ。
--   構造化ログだけだとクエリが重いため、 集計用に DB に永続化。
--   /admin/access-distribution でヒートマップ + Summary 表示する。
--   morning_card_events (0045) と完全同型 (集計 repository / 型を流用)。
--
-- RLS 可視範囲 (ai_sessions / morning_card_events と同水準、 feedback_observed_moment_broken 踏み絵):
--   ✅ 本人          (teacher で user_id = app_user_id() かつ tenant 一致)
--   ✅ system_admin   (集計用、 全件読取)
--   ❌ school_admin   (不可視 ← 教員の動きを他者に見せない)
--   ❌ 他テナント     (不可視)
--
-- 書込 (chimo 2026-05-30: teacher + school_admin を許可):
--   - teacher / school_admin 本人が自分の event を INSERT (= クライアント発火時 /api/ai-chat/events 経由)
--     兼務アカウント (system_admin 兼 school_admin) は school_admin 資格で記録される
--   - 純粋な system_admin (テナントなし) は書込不可 = カウントしない (読取のみ)
--
-- ロールバック: DROP TABLE calendar_events; DROP TYPE calendar_event_type;
-- ============================================================

CREATE TYPE calendar_event_type AS ENUM (
  'view_switched',
  'task_moved',
  'task_pushed_to_next_week',
  'task_created_from_plus',
  'day_detail_opened'
);

CREATE TABLE calendar_events (
  id          UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID                 NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID                 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type  calendar_event_type  NOT NULL,
  version     VARCHAR(32)          NOT NULL,
  payload     JSONB                NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

CREATE INDEX calendar_events_tenant_created_idx
  ON calendar_events(tenant_id, created_at DESC);
CREATE INDEX calendar_events_type_created_idx
  ON calendar_events(event_type, created_at DESC);
CREATE INDEX calendar_events_user_idx
  ON calendar_events(user_id, created_at DESC);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events FORCE ROW LEVEL SECURITY;

-- SELECT: system_admin + 本人 (school_admin は明示的に弾く)
CREATE POLICY calendar_events_read ON calendar_events
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

-- INSERT/UPDATE/DELETE: teacher / school_admin 本人のみ (純粋な system_admin は読取のみ)
CREATE POLICY calendar_events_write ON calendar_events
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );
