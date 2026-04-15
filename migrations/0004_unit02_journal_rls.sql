-- Unit-02 マイグレーション 0004: RLS ポリシー
-- SP-U02-02: journal_entries 2ポリシー構成（public_read + owner_all）
-- SP-U02-03: IDOR 防止（API 層の明示チェック + RLS WITH CHECK の二重）

-- ── journal_entries ────────────────────────────────────────
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

-- ポリシー1: 共有タイムライン（is_public=true はテナント内全員が SELECT 可）
CREATE POLICY journal_entry_public_read ON journal_entries
  AS PERMISSIVE
  FOR SELECT
  USING (
    is_public = true
    AND tenant_id = current_setting('app.tenant_id', true)::uuid
  );

-- ポリシー2: 所有者アクセス（全操作可、非公開エントリも含む）
CREATE POLICY journal_entry_owner_all ON journal_entries
  AS PERMISSIVE
  FOR ALL
  USING (
    user_id = current_setting('app.user_id', true)::uuid
    AND tenant_id = current_setting('app.tenant_id', true)::uuid
  )
  WITH CHECK (
    user_id = current_setting('app.user_id', true)::uuid
    AND tenant_id = current_setting('app.tenant_id', true)::uuid
  );

-- ── tags ───────────────────────────────────────────────────
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

-- テナント内全ユーザーが参照可（school_admin の削除チェックは API 層で）
CREATE POLICY tags_tenant_read ON tags
  AS PERMISSIVE
  FOR SELECT
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- INSERT/UPDATE/DELETE も同テナントに限定
CREATE POLICY tags_tenant_write ON tags
  AS PERMISSIVE
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── journal_entry_tags ─────────────────────────────────────
-- 中間テーブルも同テナントに限定
ALTER TABLE journal_entry_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY journal_entry_tags_tenant ON journal_entry_tags
  AS PERMISSIVE
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Fail-safe 確認コメント ─────────────────────────────────
-- current_setting('app.tenant_id', true) の第2引数 true は missing_ok
-- セッション変数未設定時は NULL を返し、UUID キャストで比較が常に偽となる
-- 結果として RLS により全拒否される（安全側に倒れる）
