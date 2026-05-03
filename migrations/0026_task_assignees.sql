-- ============================================================
-- 0026: タスクの担当者を 1:N から M:N へ拡張
--
-- 背景: 5/7 説明会向けに「タスク複製」で複数担当を代用していたが、運用上
-- 「同じタスクをみんなで進める」UX が必要と判明 (進捗共有・一覧性のため)。
--
-- 設計:
--   - tasks.owner_user_id (単一・NOT NULL) を廃止、新 task_assignees (M:N) に一本化
--   - status は task に 1 つ (全 assignee で共通、共同進捗) — 個別管理は意図的に
--     しない (個別が必要なら従来通り「複製」で 2 タスクに分ける、複製機能は維持)
--   - tasks.created_by は維持 (依頼中判定 = createdBy=self かつ self が assignees に
--     含まれない、で計算)
--
-- 既存 RLS (0015 / 0020 で構築) のうち owner_user_id 参照箇所:
--   - tasks_owner_update (0020、FOR UPDATE)
--   - tasks_owner_delete (0020、FOR DELETE)
--   - index tasks_owner_created_idx (0014)
-- これらは owner_user_id DROP 前に削除 → 新 assignee ベースで再構築。
--
-- tasks_tenant_read (0015、FOR SELECT) と tasks_tenant_insert (0020、FOR INSERT)
-- は owner_user_id 参照なしのため維持。
-- ============================================================

-- ── task_assignees (M:N) ──────────────────────────────────
CREATE TABLE task_assignees (
  task_id     UUID         NOT NULL,
  user_id     UUID         NOT NULL REFERENCES users(id),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id),
  -- 複合 FK で task の所属テナントと一致を強制 + tasks 削除時 CASCADE
  CONSTRAINT task_assignees_task_fk
    FOREIGN KEY (task_id, tenant_id)
    REFERENCES tasks(id, tenant_id)
    ON DELETE CASCADE
);

-- 「自分のタスク」フィルタ用 (user_id × tenant_id で素早く絞り込み)
CREATE INDEX task_assignees_user_tenant_idx
  ON task_assignees(user_id, tenant_id);

-- task_id から逆引き
CREATE INDEX task_assignees_task_idx
  ON task_assignees(task_id);

-- ── task_assignees の RLS ────────────────────────────────
ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignees FORCE ROW LEVEL SECURITY;

CREATE POLICY task_assignees_tenant ON task_assignees
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- ── 既存 tasks.owner_user_id を task_assignees にデータ移行 ──
INSERT INTO task_assignees (task_id, user_id, tenant_id, created_at)
SELECT id, owner_user_id, tenant_id, created_at
FROM tasks
WHERE owner_user_id IS NOT NULL;

-- ── owner_user_id を参照する既存 RLS / index を削除 ────────
DROP POLICY IF EXISTS tasks_owner_update ON tasks;
DROP POLICY IF EXISTS tasks_owner_delete ON tasks;
DROP INDEX IF EXISTS tasks_owner_created_idx;

-- ── tasks.owner_user_id カラム DROP ────────────────────────
ALTER TABLE tasks DROP COLUMN owner_user_id;

-- ── 新 RLS: assignee or createdBy ベースの UPDATE / DELETE ─
-- school_admin はテナント内全タスク無条件 (既存挙動を維持)
-- teacher は created_by=self または self が task_assignees に含まれるタスクのみ
CREATE POLICY tasks_member_update ON tasks
  FOR UPDATE
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN
        tenant_id = app_tenant_id()
        AND (
          created_by = app_user_id()
          OR EXISTS (
            SELECT 1 FROM task_assignees
            WHERE task_assignees.task_id = tasks.id
              AND task_assignees.user_id = app_user_id()
          )
        )
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

CREATE POLICY tasks_member_delete ON tasks
  FOR DELETE
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN
        tenant_id = app_tenant_id()
        AND (
          created_by = app_user_id()
          OR EXISTS (
            SELECT 1 FROM task_assignees
            WHERE task_assignees.task_id = tasks.id
              AND task_assignees.user_id = app_user_id()
          )
        )
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );
