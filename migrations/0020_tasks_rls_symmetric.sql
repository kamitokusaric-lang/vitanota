-- ============================================================
-- chimo 新仕様: tasks の RLS を対称化
--
-- 旧仕様 (0015): INSERT/UPDATE/DELETE とも teacher は owner=自分のみ、
--              school_admin はテナント内で任意操作 (他人のタスクも編集可能)
-- 新仕様:
--   INSERT: テナント内なら誰でも他人にアサインしてタスク作成可能
--           (teacher / school_admin とも対称)
--   UPDATE: owner のみ (school_admin も他人のタスクを更新不可)
--   DELETE: owner のみ (同上)
--
-- 背景: 「編集できるのは自分だけだけど、誰かにアサインするのは
--       teacher / school_admin とも可能」という完全対称の方針。
--       school_admin の唯一の特権は学校エンゲージメントタブを見る
--       ことのみ (タスク編集特権は廃止)。
-- ============================================================

DROP POLICY IF EXISTS tasks_owner_or_admin_write ON tasks;

-- INSERT: テナント内なら誰でも (他人へのアサインも可)
CREATE POLICY tasks_tenant_insert ON tasks
  FOR INSERT
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- UPDATE: owner のみ (school_admin も自分のタスクだけ)
CREATE POLICY tasks_owner_update ON tasks
  FOR UPDATE
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
                                             AND owner_user_id = app_user_id()
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
                                             AND owner_user_id = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
                                             AND owner_user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- DELETE: owner のみ
CREATE POLICY tasks_owner_delete ON tasks
  FOR DELETE
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
                                             AND owner_user_id = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
                                             AND owner_user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );
