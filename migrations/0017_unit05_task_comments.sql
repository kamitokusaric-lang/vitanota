-- ============================================================
-- Unit-05: タスクコメント機能
-- タスク 1 件に対して複数コメント (時系列)、スレッドなし
-- 可視範囲はタスクが見える人と同じ (UI 側で teacher の自分タスク限定は担保)
-- SP-U02-04 Layer 8 準拠: (task_id, tenant_id) の複合 FK
-- ============================================================

CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id UUID NOT NULL,
  -- 退会時は SET NULL で匿名化 (過去のコメントは残す)
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- SP-U02-04 Layer 8: cross-tenant 参照防止
  CONSTRAINT task_comments_task_fk
    FOREIGN KEY (task_id, tenant_id)
    REFERENCES tasks(id, tenant_id)
    ON DELETE CASCADE,

  CONSTRAINT task_comments_body_length CHECK (
    length(body) > 0 AND length(body) <= 2000
  )
);

CREATE INDEX task_comments_task_idx ON task_comments(task_id, created_at);
CREATE INDEX task_comments_tenant_idx ON task_comments(tenant_id);

-- ── RLS (0009 パターン踏襲) ─────────────────────────────────
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments FORCE ROW LEVEL SECURITY;

-- SELECT: テナント内全員
CREATE POLICY task_comments_tenant_read ON task_comments
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

-- INSERT: テナント内の自分名義で
CREATE POLICY task_comments_insert ON task_comments
  FOR INSERT
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
                                             AND user_id = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
                                             AND user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- UPDATE: 自分のコメントのみ (MVP は編集 UI なし、将来のため定義のみ)
CREATE POLICY task_comments_update ON task_comments
  FOR UPDATE
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
                                             AND user_id = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
                                             AND user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
                                             AND user_id = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
                                             AND user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- DELETE: 自分のコメント or school_admin はテナント内の誰のでも
CREATE POLICY task_comments_delete ON task_comments
  FOR DELETE
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
                                             AND user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );
