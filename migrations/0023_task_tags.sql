-- ============================================================
-- 0023: タスク用タグ (task_tags + task_tag_assignments)
-- 5/7 教員向け説明会向け機能拡張: イベント横断のタスク集約
--
-- ユースケース: 教頭先生が「運動会」タグを作り、各教員のタスクに付与し、
-- タグでフィルタすれば運動会関連の全教員タスクを一覧で進捗確認できる。
-- 各教員も自由にタグを作成可。
--
-- 既存 emotion_tags (journal 用) とは独立。
--
-- RLS パターン: 0009 の CASE 式 (app_role / app_tenant_id / app_user_id)
-- task_tag_assignments には tenant_id を denormalize して RLS で直接判定。
-- ============================================================

-- ── task_tags ──────────────────────────────────────────────
CREATE TABLE task_tags (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  created_by  UUID         NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_task_tags_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX task_tags_tenant_idx ON task_tags(tenant_id);

-- ── task_tag_assignments (M:N) ─────────────────────────────
CREATE TABLE task_tag_assignments (
  task_id     UUID         NOT NULL REFERENCES tasks(id)     ON DELETE CASCADE,
  tag_id      UUID         NOT NULL REFERENCES task_tags(id) ON DELETE RESTRICT,
  tenant_id   UUID         NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, tag_id)
);

-- タグ別フィルタ用 (tag_id で全テナント走査ではなく tenant_id で絞った後に tag_id)
CREATE INDEX task_tag_assignments_tenant_tag_idx
  ON task_tag_assignments(tenant_id, tag_id);

-- タグ削除可否判定 (タグ参照件数 COUNT) 用
CREATE INDEX task_tag_assignments_tag_idx
  ON task_tag_assignments(tag_id);

-- ============================================================
-- RLS ポリシー
-- ============================================================

-- ── task_tags ──
ALTER TABLE task_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_tags FORCE ROW LEVEL SECURITY;

-- SELECT: テナント内全員
CREATE POLICY task_tags_read ON task_tags
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

-- INSERT/UPDATE/DELETE: テナント内全員 (chimo 確定: 全教員作成可、削除も可)
-- 削除時の利用中チェックは API 層で先回り 409 + DB レベルで FK ON DELETE RESTRICT が物理保護
CREATE POLICY task_tags_write ON task_tags
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

-- ── task_tag_assignments ──
ALTER TABLE task_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_tag_assignments FORCE ROW LEVEL SECURITY;

-- SELECT/INSERT/DELETE: テナント内全員 (UPDATE は不要)
CREATE POLICY task_tag_assignments_tenant ON task_tag_assignments
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
