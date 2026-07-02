-- ============================================================
-- 0056: 職員室ノート (公開 journal_entries) へのコメント機能
-- 1 エントリに複数コメント (時系列)、スレッドなし・単線構造。
-- 可視範囲は tenant 内全員 (職員室ノートは公開前提)。
-- 複合 FK (journal_entry_id, tenant_id) でクロステナント参照を物理防止。
-- RLS は task_comments (0017) パターンを踏襲。
-- ============================================================

CREATE TABLE journal_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  journal_entry_id UUID NOT NULL,
  -- 退会時は SET NULL で匿名化 (コメント自体は残す)
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- クロステナント参照防止 (複合 FK)
  CONSTRAINT journal_comments_entry_fk
    FOREIGN KEY (journal_entry_id, tenant_id)
    REFERENCES journal_entries(id, tenant_id)
    ON DELETE CASCADE,

  CONSTRAINT journal_comments_body_length CHECK (
    length(body) > 0 AND length(body) <= 2000
  )
);

CREATE INDEX journal_comments_entry_idx ON journal_comments(journal_entry_id, created_at);
CREATE INDEX journal_comments_tenant_idx ON journal_comments(tenant_id);

-- ── RLS (task_comments 0017 パターン踏襲) ─────────────────────
ALTER TABLE journal_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_comments FORCE ROW LEVEL SECURITY;

-- SELECT: テナント内全員 (職員室ノートは相互関心層に公開)
CREATE POLICY journal_comments_tenant_read ON journal_comments
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
CREATE POLICY journal_comments_insert ON journal_comments
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
CREATE POLICY journal_comments_update ON journal_comments
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
CREATE POLICY journal_comments_delete ON journal_comments
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
