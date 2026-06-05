# Unit-03 インフラ設計

**作成日**: 2026-04-17
**対象ストーリー**: US-T-020（感情タグ記録）・US-T-030（感情傾向グラフ）

---

## インフラ変更サマリー

Unit-03 は **インフラ構成の変更なし**。DB マイグレーション（スキーマ変更）のみ。

| コンポーネント | 変更 |
|---|---|
| App Runner | なし |
| RDS PostgreSQL | マイグレーション追加（enum 型 + カラム変更 + データ移行） |
| RDS Proxy | なし |
| CloudFront | なし |
| WAF | なし |
| Secrets Manager | なし |
| CloudWatch | なし |
| EventBridge | なし |
| Lambda | なし |
| CDK | なし |

---

## DB マイグレーション設計

### マイグレーション: `0010_unit03_tag_type_category.sql`

```sql
-- ============================================================
-- Unit-03: tags テーブルに type/category enum を追加
-- ============================================================

-- Step 1: enum 型の作成
CREATE TYPE tag_type AS ENUM ('emotion', 'context');
CREATE TYPE emotion_category AS ENUM ('positive', 'negative', 'neutral');

-- Step 2: 新カラム追加
ALTER TABLE tags ADD COLUMN type tag_type NOT NULL DEFAULT 'context';
ALTER TABLE tags ADD COLUMN category emotion_category;

-- Step 3: 既存データ移行 (is_emotion → type)
UPDATE tags SET type = 'emotion' WHERE is_emotion = true;

-- Step 4: 既知の感情タグに category を設定
-- (テナントごとにシードされた既存タグを更新)
UPDATE tags SET category = 'positive' WHERE is_emotion = true AND name IN ('うれしい', 'やってみた');
UPDATE tags SET category = 'negative' WHERE is_emotion = true AND name IN ('つかれた', '行き詰まり');
UPDATE tags SET category = 'neutral'  WHERE is_emotion = true AND name IN ('相談したい');

-- Step 5: CHECK 制約追加
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
```

### マイグレーション: `0011_unit03_default_tags_v2.sql`

```sql
-- ============================================================
-- Unit-03: 新規システムデフォルトタグを全既存テナントにシード
-- ============================================================

-- 全テナントに新規感情タグ + コンテキストタグを挿入
-- ON CONFLICT DO NOTHING で冪等性を保証
INSERT INTO tags (tenant_id, name, type, category, is_system_default, sort_order)
SELECT t.id, v.name, v.type::tag_type, v.category::emotion_category, true, v.sort_order
FROM tenants t
CROSS JOIN (VALUES
  -- 感情タグ: positive
  ('喜び',     'emotion', 'positive', 1),
  ('達成感',   'emotion', 'positive', 2),
  ('充実',     'emotion', 'positive', 3),
  ('安心',     'emotion', 'positive', 4),
  ('感謝',     'emotion', 'positive', 5),
  -- 感情タグ: negative
  ('不安',     'emotion', 'negative', 6),
  ('ストレス', 'emotion', 'negative', 7),
  ('疲労',     'emotion', 'negative', 8),
  ('焦り',     'emotion', 'negative', 9),
  ('不満',     'emotion', 'negative', 10),
  -- 感情タグ: neutral
  ('忙しい',   'emotion', 'neutral',  11),
  ('混乱',     'emotion', 'neutral',  12),
  ('気づき',   'emotion', 'neutral',  13),
  ('無力感',   'emotion', 'neutral',  14),
  ('もやもや', 'emotion', 'neutral',  15),
  -- コンテキストタグ
  ('授業',     'context', NULL, 16),
  ('生徒対応', 'context', NULL, 17),
  ('保護者対応','context', NULL, 18),
  ('校務',     'context', NULL, 19),
  ('会議',     'context', NULL, 20),
  ('部活動',   'context', NULL, 21),
  ('事務作業', 'context', NULL, 22),
  ('その他',   'context', NULL, 23)
) AS v(name, type, category, sort_order)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- 旧システムデフォルトタグの削除（新タグに置き換え）
-- 注意: 旧タグが journal_entry_tags で使われている場合は残す
-- 使われていない旧タグのみ削除
DELETE FROM tags
WHERE is_system_default = true
  AND name IN ('うれしい', 'つかれた', 'やってみた', '行き詰まり', '相談したい', '授業準備', '保護者対応', '行事準備')
  AND name NOT IN ('保護者対応')  -- 新タグと重複するものは残す
  AND id NOT IN (SELECT tag_id FROM journal_entry_tags);
```

---

## テナント作成フローの更新

`pages/api/system/tenants.ts` のタグシード処理を更新：
- 旧: 8件（うれしい・つかれた・やってみた・行き詰まり・相談したい・授業準備・保護者対応・行事準備）
- 新: 23件（感情タグ 15個 + コンテキストタグ 8個）
- `type` と `category` を指定して INSERT

---

## RLS への影響

**影響なし**。

既存の tags RLS ポリシーは `tenant_id` のみで判定しているため、`type`/`category` カラムの追加・`is_emotion` の削除は RLS に影響しない。

```sql
-- 既存ポリシー（変更不要）
CREATE POLICY tags_tenant_read ON tags
  FOR SELECT
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
```
