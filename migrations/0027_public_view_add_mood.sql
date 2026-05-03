-- ============================================================
-- 0027: public_journal_entries VIEW に mood 列を追加
--
-- 背景: 共有タイムラインでも mood 絵文字を表示したい (chimo 確認、
-- 2026-05-04)。教員同士で見える mood / 感情タグは「相互関心」の
-- 対称チャネルであり、踏み絵 (feedback_observed_moment_broken) を
-- 通過する設計と判定。
--
-- 注意: CREATE OR REPLACE VIEW は既存列の順序・名前を変えられない
-- (新列を末尾に追加するときも列の rename と解釈されエラー)。
-- DROP + CREATE パターンで再定義する。
-- ============================================================

DROP VIEW IF EXISTS public_journal_entries;

CREATE VIEW public_journal_entries AS
  SELECT
    id,
    tenant_id,
    user_id,
    content,
    mood,
    created_at,
    updated_at
    -- 意図的に is_public 列を含めない (漏えい物理防止、0005 と同じ方針)
  FROM journal_entries
  WHERE is_public = true;

ALTER VIEW public_journal_entries SET (security_barrier = true);

-- アプリケーションユーザー向け SELECT 権限 (0005 で付与済だが DROP で
-- 失われるので再付与)。RLS は基底テーブル journal_entries の policy 適用。
GRANT SELECT ON public_journal_entries TO PUBLIC;
