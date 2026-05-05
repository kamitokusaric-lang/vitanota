-- ============================================================
-- 0031: ナレッジ共有用タグ (knowledge_tags + journal_entry_knowledge_tags)
-- journal_entries.kind = 'knowledge' に任意付与可。tweet/diary には付けない。
-- 既存 emotion_tags (kind='tweet' 用) / task_tags とは独立。
-- 構造・RLS は task_tags パターン (テナント内全員 CRUD 可、削除は FK RESTRICT で物理保護)。
-- ============================================================

-- ── knowledge_tags ──────────────────────────────────────────
CREATE TABLE knowledge_tags (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  created_by  UUID         NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_knowledge_tags_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX knowledge_tags_tenant_idx ON knowledge_tags(tenant_id);

-- ── journal_entry_knowledge_tags (M:N 中間) ─────────────────
CREATE TABLE journal_entry_knowledge_tags (
  journal_entry_id  UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  knowledge_tag_id  UUID NOT NULL REFERENCES knowledge_tags(id)  ON DELETE RESTRICT,
  tenant_id         UUID NOT NULL REFERENCES tenants(id)         ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (journal_entry_id, knowledge_tag_id)
);

CREATE INDEX journal_entry_knowledge_tags_tenant_tag_idx
  ON journal_entry_knowledge_tags(tenant_id, knowledge_tag_id);
CREATE INDEX journal_entry_knowledge_tags_tag_idx
  ON journal_entry_knowledge_tags(knowledge_tag_id);

-- ============================================================
-- RLS ポリシー
-- ============================================================

-- ── knowledge_tags ──
ALTER TABLE knowledge_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_tags FORCE ROW LEVEL SECURITY;

-- SELECT: テナント内全員
CREATE POLICY knowledge_tags_read ON knowledge_tags
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

-- INSERT/UPDATE/DELETE: テナント内全員 (task_tags と同じ)
CREATE POLICY knowledge_tags_write ON knowledge_tags
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

-- ── journal_entry_knowledge_tags ──
ALTER TABLE journal_entry_knowledge_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_knowledge_tags FORCE ROW LEVEL SECURITY;

-- SELECT/INSERT/DELETE: テナント内全員 (UPDATE は不要)
CREATE POLICY journal_entry_knowledge_tags_tenant ON journal_entry_knowledge_tags
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
