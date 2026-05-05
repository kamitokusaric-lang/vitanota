-- ============================================================
-- journal_entries に種別 (kind) を追加
--   diary     : 既存「日々ノート」(mood 必須 + content 1000字)
--   knowledge : ナレッジ共有 (content 1000字、mood/tag なし)
--   tweet     : つぶやき (content 200字 + emotion_tags 付与可、mood なし)
-- 既存データは default 'diary' で migrate される。
-- mood / emotion_tags の kind 別制約は API/Zod レベルで担保 (DB CHECK は付けない)。
-- ============================================================

CREATE TYPE journal_entry_kind AS ENUM ('diary', 'knowledge', 'tweet');

ALTER TABLE journal_entries
  ADD COLUMN kind journal_entry_kind NOT NULL DEFAULT 'diary';
