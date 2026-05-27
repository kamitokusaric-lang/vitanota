-- ============================================================
-- 0046 のロールバック SQL (手動適用)
--
-- forward-only migration の体制を維持するため、 0046 自体ではなく
-- ロールバックは別 SQL として保管する。 適用判断は chimo に委ねる。
--
-- 注意:
--   - 旧 PK (journal_entry_id, user_id) は重複を許容しなかったため、
--     reaction_type != 'knowledge' の行を PK 戻し時に削除する必要がある。
--   - 削除する行は appreciation / endorsement reaction。 リカバリ不可。
-- ============================================================

-- Step 1: 旧 PK 互換性のため、 knowledge 以外の reaction を物理削除
DELETE FROM journal_knowledge_reactions
WHERE reaction_type <> 'knowledge';

-- Step 2: PK を旧形に戻す
ALTER TABLE journal_knowledge_reactions DROP CONSTRAINT journal_knowledge_reactions_pkey;
ALTER TABLE journal_knowledge_reactions ADD PRIMARY KEY (journal_entry_id, user_id);

-- Step 3: 列を削除し、 enum も DROP
ALTER TABLE journal_knowledge_reactions DROP COLUMN reaction_type;
DROP TYPE journal_reaction_type;
