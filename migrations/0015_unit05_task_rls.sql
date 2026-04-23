-- ============================================================
-- Unit-05 RLS: tasks / task_categories のロール別ポリシー
-- 0009 の CASE 式パターンを踏襲 (app_role / app_tenant_id / app_user_id)
--
-- ポリシー方針:
--   tasks の SELECT はテナント内全員 (教員同士でタスクを共有、哲学「管理者独占を避ける」)
--   tasks の INSERT は teacher は owner=自分のみ、school_admin は任意アサイン可
--   tasks の UPDATE/DELETE は owner または school_admin
--   task_categories の SELECT はテナント内全員、INSERT/UPDATE/DELETE は school_admin のみ
-- ============================================================

-- ── task_categories ────────────────────────────────────────
ALTER TABLE task_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_categories FORCE ROW LEVEL SECURITY;

-- SELECT: テナント内全員
CREATE POLICY task_categories_read ON task_categories
  FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- INSERT/UPDATE/DELETE: school_admin (と system_admin) のみ
CREATE POLICY task_categories_write ON task_categories
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN false
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN false
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- ── tasks ──────────────────────────────────────────────────
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;

-- SELECT: テナント内全員 (哲学「透明性」に従う、比較感は UI 側で緩和)
CREATE POLICY tasks_tenant_read ON tasks
  FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- INSERT/UPDATE/DELETE: teacher は owner=自分のみ、school_admin はテナント内で任意
CREATE POLICY tasks_owner_or_admin_write ON tasks
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
                                             AND owner_user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
                                             AND owner_user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );
