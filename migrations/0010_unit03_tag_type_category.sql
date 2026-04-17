-- ============================================================
-- Unit-03: tags テーブルに type/category enum を追加
-- is_emotion boolean → type enum + category enum に移行
-- ============================================================

-- Step 1: enum 型の作成
CREATE TYPE tag_type AS ENUM ('emotion', 'context');
CREATE TYPE emotion_category AS ENUM ('positive', 'negative', 'neutral');

-- Step 2: 新カラム追加（既存行は type='context', category=NULL になる）
ALTER TABLE tags ADD COLUMN type tag_type NOT NULL DEFAULT 'context';
ALTER TABLE tags ADD COLUMN category emotion_category;

-- Step 3: 既存データ移行 (is_emotion=true → type='emotion')
UPDATE tags SET type = 'emotion' WHERE is_emotion = true;

-- Step 4: 既知の感情タグに category を設定
-- Unit-02 でシードされた旧感情タグ
UPDATE tags SET category = 'positive' WHERE is_emotion = true AND name IN ('うれしい', 'やってみた');
UPDATE tags SET category = 'negative' WHERE is_emotion = true AND name IN ('つかれた', '行き詰まり');
UPDATE tags SET category = 'neutral'  WHERE is_emotion = true AND name IN ('相談したい');

-- Step 5: CHECK 制約追加（emotion には category 必須、context には category NULL）
ALTER TABLE tags ADD CONSTRAINT tags_emotion_category_check
  CHECK (
    (type = 'emotion' AND category IS NOT NULL) OR
    (type = 'context' AND category IS NULL)
  );

-- Step 6: 旧カラム削除
ALTER TABLE tags DROP COLUMN is_emotion;

-- Step 7: インデックス更新
DROP INDEX IF EXISTS tags_tenant_emotion_idx;
CREATE INDEX tags_tenant_type_idx ON tags (tenant_id, type);
