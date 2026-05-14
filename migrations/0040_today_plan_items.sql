-- ============================================================
-- 0040: today_plan_items (H3 「朝の見通し作り」)
--
-- 設計: project_phase1_core_experience「雑に投げる → 整う → 残る」と並列に、
-- 「残ってる → 整う → 今日に絞る」動線。今日の余裕に合わせて AI が
-- 既存タスクを「今日やる / 余裕があれば」の 2 軸に分類、教員が編集 / 確定 /
-- Done する。
--
-- 1 セッション = 1 朝の見通し作り (ai_sessions.type='morning_plan')、
-- そのセッションに紐づくタスク一覧をこの表で保持。
--
-- RLS 可視範囲 (project_ai_sessions_visibility 踏襲):
--   ✅ 本人          (teacher / school_admin で本人のみ)
--   ✅ system_admin  (集計用、全件読取)
--   ❌ 他テナント
--   ❌ 他教員 (school_admin も他人の今日のプランは見えない、踏み絵)
-- ============================================================

CREATE TABLE today_plan_items (
  session_id      UUID        NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
  task_id         UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- ai_bucket: 'today' / 'optional' = AI 提案、NULL = 教員が手動で追加 (AI 提案外)
  ai_bucket       TEXT        CHECK (ai_bucket IS NULL OR ai_bucket IN ('today', 'optional')),
  -- final_bucket: 'today' / 'optional' = 教員が bucket 移動 (or AI 案維持で NULL)
  --              'excluded' = 教員が「今日やらない」と外した (row は残して集計可能に)
  final_bucket    TEXT        CHECK (final_bucket IS NULL OR final_bucket IN ('today', 'optional', 'excluded')),
  done_at         TIMESTAMPTZ,
  moved_count     INTEGER     NOT NULL DEFAULT 0,
  last_moved_to   TEXT        CHECK (last_moved_to IS NULL OR last_moved_to IN ('today', 'optional', 'excluded')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, task_id)
);

CREATE INDEX today_plan_items_user_session_idx
  ON today_plan_items(user_id, session_id);

CREATE INDEX today_plan_items_session_idx
  ON today_plan_items(session_id);

-- 「今日進んだこと」セクション用: user_id × done_at で時系列に並べる
CREATE INDEX today_plan_items_user_done_idx
  ON today_plan_items(user_id, done_at DESC)
  WHERE done_at IS NOT NULL;

ALTER TABLE today_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE today_plan_items FORCE ROW LEVEL SECURITY;

-- SELECT: system_admin + 本人 (school_admin も本人の分のみ)
CREATE POLICY today_plan_items_read ON today_plan_items
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

-- INSERT/UPDATE/DELETE: 本人のみ (system_admin は読取のみ)
CREATE POLICY today_plan_items_write ON today_plan_items
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
