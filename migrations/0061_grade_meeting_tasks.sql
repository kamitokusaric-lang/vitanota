-- ============================================================
-- 0061: 学年会で決めた「やること」を既存タスクに紐付ける
--
-- 学年会ではクラスに紐づかない仕事も出る (行事の準備・学年通信・保護者対応)。
-- これを学年会専用の TODO として作ると、担当・期限・完了の仕組みが
-- tasks と二重になる。そこで **実体は既存 tasks** に作り、
-- 「どの会で決まったか」の紐付けだけをこの中間テーブルが持つ。
--
-- 研修の workshop_reflections (振り返りを既存 journal_entries に溶かし、
-- 中間テーブルで箱に紐付ける) と同じ形。tasks は ALTER しない。
--
-- 紐付いたタスクは既存のタスクタブにもそのまま出る = 学年会の決定が
-- 日常の持ち場に流れる。
--
-- 完了チェックが付くことについて:
--   クラスの「次の一手」には意図的に達成度を持たせていない (前提や見立てを
--   採点しないため)。一方こちらは業務の TODO なので、終わったかどうかは
--   普通に業務の話として扱ってよい (docs/PHILOSOPHY.md の線引き)。
-- ============================================================

CREATE TABLE grade_meeting_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL,
  task_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- クロステナント参照の物理防止 (複合 FK)
  CONSTRAINT grade_meeting_tasks_meeting_fk
    FOREIGN KEY (meeting_id, tenant_id)
    REFERENCES grade_meetings(id, tenant_id)
    ON DELETE CASCADE,
  -- タスクを消したら紐付けも消える
  CONSTRAINT grade_meeting_tasks_task_fk
    FOREIGN KEY (task_id, tenant_id)
    REFERENCES tasks(id, tenant_id)
    ON DELETE CASCADE,

  CONSTRAINT grade_meeting_tasks_unique UNIQUE (meeting_id, task_id)
);

CREATE INDEX grade_meeting_tasks_tenant_idx ON grade_meeting_tasks(tenant_id);
CREATE INDEX grade_meeting_tasks_meeting_idx ON grade_meeting_tasks(meeting_id);

ALTER TABLE grade_meeting_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_meeting_tasks FORCE ROW LEVEL SECURITY;

-- SELECT: テナント内 (紐付いた tasks 自体も tenant-read なので露出は増えない)
CREATE POLICY grade_meeting_tasks_tenant_read ON grade_meeting_tasks
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

-- INSERT: テナント内 (学年会でタスクを起こすトランザクション内で実行)
CREATE POLICY grade_meeting_tasks_insert ON grade_meeting_tasks
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

-- DELETE: テナント内 (会からやることを外す。tasks 本体は残る)
CREATE POLICY grade_meeting_tasks_delete ON grade_meeting_tasks
  FOR DELETE
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );
