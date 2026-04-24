-- ============================================================
-- 日々ノートにムード(5段階)を追加
--
-- 背景: タグ必須化は踏み絵 (観測感) の都合で却下。
--       代わりに絵文字ベースの軽量なムード選択を必須化する。
--       タグは従来どおり任意、ムードは新規投稿で必須。
--       既存投稿は mood=NULL のまま保持 (歴史的経緯)
-- ============================================================

CREATE TYPE mood_level AS ENUM (
  'very_positive', -- 😊
  'positive',      -- 🙂
  'neutral',       -- 😐
  'negative',      -- 😥
  'very_negative'  -- 😣
);

ALTER TABLE journal_entries
  ADD COLUMN mood mood_level;
