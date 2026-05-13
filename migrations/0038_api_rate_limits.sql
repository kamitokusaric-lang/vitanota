-- ============================================================
-- 0038: api_rate_limits (Unit-05 Bedrock コスト保護)
--
-- 1 日あたりの API 呼び出し回数を user × endpoint × date 単位で UPSERT。
-- 主用途は /api/ai-chat/extract の日次上限制御 (NFR-U05-COST-01)。
--
-- RLS 可視範囲:
--   ✅ system_admin: 全件
--   ✅ teacher:    自分の counter のみ (API server が teacher role で UPSERT)
--   ❌ school_admin: 不可視 (他教員の AI 利用状況見るのは観測踏み絵)
-- ============================================================

CREATE TABLE api_rate_limits (
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   VARCHAR(80) NOT NULL,
  date       DATE        NOT NULL,
  count      INTEGER     NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, endpoint, date)
);

CREATE INDEX api_rate_limits_date_idx ON api_rate_limits(date);

ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_rate_limits FORCE ROW LEVEL SECURITY;

-- SELECT: system_admin + 本人 (school_admin 不可視)
CREATE POLICY api_rate_limits_read ON api_rate_limits
  FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'system_admin' THEN true
      WHEN app_role() = 'school_admin' THEN false
      WHEN app_role() = 'teacher'      THEN user_id = app_user_id()
      WHEN app_role() IS NULL          THEN false
      ELSE false
    END
  );

-- 書き込み: 本人のみ (counter UPSERT)
CREATE POLICY api_rate_limits_write ON api_rate_limits
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'teacher' THEN user_id = app_user_id()
      WHEN app_role() IS NULL     THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'teacher' THEN user_id = app_user_id()
      WHEN app_role() IS NULL     THEN false
      ELSE false
    END
  );
