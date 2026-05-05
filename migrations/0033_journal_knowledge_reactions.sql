-- ============================================================
-- 0033: 投稿に対する「ナレッジリアクション」テーブル
--
-- ユースケース: 投稿者が kind='diary' or 'tweet' で投稿したが、
-- 他の教員が「これはナレッジに値する」と感じた時にリアクションを付ける。
-- 1 ユーザー × 1 投稿 で 1 リアクション (PK で重複防止)。
-- 自分の投稿への reaction は API 層で 403 (本マイグレーションでは DB 制約なし)。
--
-- 構造は task_tag_assignments パターンに揃える (tenant_id を denormalize し
-- RLS で直接判定、複合 PK)。
-- ============================================================

CREATE TABLE journal_knowledge_reactions (
  journal_entry_id  UUID         NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  user_id           UUID         NOT NULL REFERENCES users(id)           ON DELETE CASCADE,
  tenant_id         UUID         NOT NULL REFERENCES tenants(id)         ON DELETE CASCADE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (journal_entry_id, user_id)
);

-- entry 別の集計 (count + 自分が ON か OFF か) 用
CREATE INDEX journal_knowledge_reactions_entry_idx
  ON journal_knowledge_reactions(journal_entry_id);

-- tenant + user で「自分の reaction 一覧」検索用
CREATE INDEX journal_knowledge_reactions_tenant_user_idx
  ON journal_knowledge_reactions(tenant_id, user_id);

-- ============================================================
-- RLS ポリシー
-- ============================================================

ALTER TABLE journal_knowledge_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_knowledge_reactions FORCE ROW LEVEL SECURITY;

-- SELECT: テナント内全員 (count / 自分の有無を見るため)
CREATE POLICY journal_knowledge_reactions_read ON journal_knowledge_reactions
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

-- INSERT/DELETE: 自分の user_id でテナント内のみ (UPDATE は PK 不変なので不要)
CREATE POLICY journal_knowledge_reactions_write ON journal_knowledge_reactions
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );
