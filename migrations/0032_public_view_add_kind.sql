-- ============================================================
-- 0032: public_journal_entries VIEW に kind 列を追加
--
-- 背景: 0030 で journal_entries に kind enum (diary/knowledge/tweet) を追加。
-- 共有タイムラインで種別バッジを表示するため、VIEW にも kind を含める。
--
-- DROP + CREATE パターン (0027 と同じ)。再作成時に security_invoker と
-- security_barrier を再付与する必要あり (0028 の判定ロジックも維持)。
-- ============================================================

DROP VIEW IF EXISTS public_journal_entries;

CREATE VIEW public_journal_entries AS
  SELECT
    id,
    tenant_id,
    user_id,
    content,
    mood,
    kind,
    created_at,
    updated_at
    -- 意図的に is_public 列を含めない (漏えい物理防止、0005 と同じ方針)
  FROM journal_entries
  WHERE is_public = true;

-- 0028 の tenant 越境防御: invoker 権限で RLS を効かせる
ALTER VIEW public_journal_entries SET (security_invoker = true);
ALTER VIEW public_journal_entries SET (security_barrier = true);

-- 0005 で付与済だが DROP で失われるので再付与
GRANT SELECT ON public_journal_entries TO PUBLIC;
