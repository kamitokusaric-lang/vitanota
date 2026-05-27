-- ============================================================
-- 0046: journal_knowledge_reactions を 3 種類のリアクションに拡張
--
-- 背景 (H9 検証, 2026-05-27):
--   公開投稿に「見てもらえた気配」 を増やすため、 既存「ナレッジリアクション」
--   (= 参考になった) に加えて、 「お疲れ様です」 (appreciation) と
--   「すてきです」 (endorsement) の 2 種類を追加する。
--   閲覧追跡 DB は作らず、 リアクション拡張だけで気配を出す方針
--   (= 「観測されてる感」 を出さない、 vitanota の最上位踏み絵)。
--
-- 互換性:
--   - 既存データは default 'knowledge' で自動補完されるため無破壊。
--   - 1 ユーザー × 1 投稿 × 1 リアクション種別 で 1 toggle (PK 拡張で重複防止)。
--   - 自分の投稿への reaction も API 層で許可 (= セルフ労い動線)。 RLS は user_id
--     条件のみで reaction_type 非依存のため変更不要。
-- ============================================================

CREATE TYPE journal_reaction_type AS ENUM (
  'knowledge',     -- 参考になった (旧「ナレッジリアクション」, 既存データはこれ)
  'appreciation',  -- お疲れ様です
  'endorsement'    -- すてきです
);

ALTER TABLE journal_knowledge_reactions
  ADD COLUMN reaction_type journal_reaction_type NOT NULL DEFAULT 'knowledge';

ALTER TABLE journal_knowledge_reactions DROP CONSTRAINT journal_knowledge_reactions_pkey;
ALTER TABLE journal_knowledge_reactions
  ADD PRIMARY KEY (journal_entry_id, user_id, reaction_type);
