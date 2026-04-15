-- Unit-02 マイグレーション 0005: public_journal_entries VIEW
-- SP-U02-04 Layer 4: is_public=true エントリのみを露出する VIEW
-- WHERE 句を VIEW 定義に内包し、is_public 列自体も露出しない

CREATE VIEW public_journal_entries AS
  SELECT
    id,
    tenant_id,
    user_id,
    content,
    created_at,
    updated_at
    -- 意図的に is_public 列を含めない（漏えい物理防止）
  FROM journal_entries
  WHERE is_public = true;

-- security_barrier で悪意あるサブクエリ経由の情報漏えいを防止
-- PostgreSQL の security_barrier=true にすると、VIEW の述語が
-- 外部の WHERE 句よりも先に評価され、攻撃者による述語プッシュダウンを防げる
ALTER VIEW public_journal_entries SET (security_barrier = true);

-- アプリケーションユーザーに SELECT 権限を付与
-- RLS は基底テーブル journal_entries のポリシーが適用される
GRANT SELECT ON public_journal_entries TO PUBLIC;
