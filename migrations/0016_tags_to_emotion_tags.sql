-- ============================================================
-- tags → emotion_tags へのリファクタリング
--
-- 背景: context タグは task_categories に役割を移譲した (0014)。
-- journal は emotion タグ + 本文に徹するため、tags は emotion 専用化する。
--
-- 段取り:
--   1. journal_entry_tags から context タグの紐付けを削除
--   2. tags から context 行を削除
--   3. 旧 CHECK 制約削除 → type 列削除 → category を NOT NULL 化
--   4. tag_type enum 削除
--   5. tags テーブルを emotion_tags にリネーム
--   6. インデックス・制約・ポリシー・FK 名をリネーム
--   7. tenant + category 用の新インデックス作成
--
-- journal_entry_tags の FK 参照は PostgreSQL が内部 OID で追跡するため
-- テーブルリネームに自動追従。可読性のため FK 名だけ後続で rename。
-- ============================================================

-- ── Step 1: context 紐付けの削除 ───────────────────────────
DELETE FROM journal_entry_tags
WHERE tag_id IN (SELECT id FROM tags WHERE type = 'context');

-- ── Step 2: context タグ行の削除 ───────────────────────────
DELETE FROM tags WHERE type = 'context';

-- ── Step 3: type 列を外す前準備 ────────────────────────────
-- 0010 で付与した CHECK 制約 (type/category 依存) を先に落とす
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_emotion_category_check;

-- type 列を含む index を明示的に drop (列削除時に自動 drop されるが明示)
DROP INDEX IF EXISTS tags_tenant_type_idx;

-- type 列削除
ALTER TABLE tags DROP COLUMN type;

-- category を NOT NULL に (emotion 専用なので全行で値がある前提)
ALTER TABLE tags ALTER COLUMN category SET NOT NULL;

-- ── Step 4: tag_type enum 削除 ─────────────────────────────
DROP TYPE IF EXISTS tag_type;

-- ── Step 5: テーブルをリネーム ─────────────────────────────
ALTER TABLE tags RENAME TO emotion_tags;

-- ── Step 6: 関連オブジェクト名の整理 ────────────────────────
-- UNIQUE 制約 / INDEX の rename
ALTER INDEX tags_id_tenant_unique RENAME TO emotion_tags_id_tenant_unique;
ALTER INDEX tags_tenant_name_unique RENAME TO emotion_tags_tenant_name_unique;
ALTER INDEX tags_tenant_name_lower_idx RENAME TO emotion_tags_tenant_name_lower_idx;

-- RLS ポリシーの rename (0009 で定義されたもの)
ALTER POLICY tags_tenant_read  ON emotion_tags RENAME TO emotion_tags_tenant_read;
ALTER POLICY tags_tenant_write ON emotion_tags RENAME TO emotion_tags_tenant_write;

-- journal_entry_tags の FK 名を新テーブル名に合わせて rename
ALTER TABLE journal_entry_tags
  RENAME CONSTRAINT journal_entry_tags_tag_fk
  TO journal_entry_emotion_tag_fk;

-- ── Step 7: tenant + category 用の新インデックス ───────────
-- tags_tenant_type_idx の代替として、category 別集計を高速化する
CREATE INDEX emotion_tags_tenant_category_idx
  ON emotion_tags (tenant_id, category);
