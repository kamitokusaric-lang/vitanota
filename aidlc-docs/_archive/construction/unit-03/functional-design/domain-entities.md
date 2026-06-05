# Unit-03 ドメインエンティティ

**作成日**: 2026-04-16
**対象ストーリー**: US-T-020（感情タグ記録）・US-T-030（感情傾向グラフ）

---

## スキーマ変更（新規マイグレーション）

### tags テーブルの変更

**変更内容**: `is_emotion` boolean を `type` enum + `category` enum に置き換え

```sql
-- 新規 enum 型
CREATE TYPE tag_type AS ENUM ('emotion', 'context');
CREATE TYPE emotion_category AS ENUM ('positive', 'negative', 'neutral');

-- カラム変更
ALTER TABLE tags ADD COLUMN type tag_type NOT NULL DEFAULT 'context';
ALTER TABLE tags ADD COLUMN category emotion_category;

-- 既存データ移行: is_emotion = true → type = 'emotion'
UPDATE tags SET type = 'emotion' WHERE is_emotion = true;

-- 旧カラム削除
ALTER TABLE tags DROP COLUMN is_emotion;

-- 制約: emotion タグには category 必須、context タグには category は NULL
ALTER TABLE tags ADD CONSTRAINT tags_emotion_category_check
  CHECK (
    (type = 'emotion' AND category IS NOT NULL) OR
    (type = 'context' AND category IS NULL)
  );
```

### Drizzle スキーマ変更（src/db/schema.ts）

```typescript
// 新規 enum
export const tagTypeEnum = pgEnum('tag_type', ['emotion', 'context']);
export const emotionCategoryEnum = pgEnum('emotion_category', ['positive', 'negative', 'neutral']);

// tags テーブル変更
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 50 }).notNull(),
  type: tagTypeEnum('type').notNull().default('context'),           // NEW
  category: emotionCategoryEnum('category'),                        // NEW (nullable)
  isSystemDefault: boolean('is_system_default').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  idTenantUnique: unique('tags_id_tenant_unique').on(table.id, table.tenantId),
  tenantNameUnique: unique('tags_tenant_name_unique').on(table.tenantId, table.name),
  tenantTypeIdx: index('tags_tenant_type_idx').on(table.tenantId, table.type),  // RENAMED
}));
```

---

## システムデフォルトタグ

テナント作成時に自動シードされるタグ一覧。

### 感情タグ（type = 'emotion'）: 15個

| name | category | sort_order |
|---|---|---|
| 喜び | positive | 1 |
| 達成感 | positive | 2 |
| 充実 | positive | 3 |
| 安心 | positive | 4 |
| 感謝 | positive | 5 |
| 不安 | negative | 6 |
| ストレス | negative | 7 |
| 疲労 | negative | 8 |
| 焦り | negative | 9 |
| 不満 | negative | 10 |
| 忙しい | neutral | 11 |
| 混乱 | neutral | 12 |
| 気づき | neutral | 13 |
| 無力感 | neutral | 14 |
| もやもや | neutral | 15 |

### コンテキストタグ（type = 'context'）: 8個

| name | category | sort_order |
|---|---|---|
| 授業 | NULL | 16 |
| 生徒対応 | NULL | 17 |
| 保護者対応 | NULL | 18 |
| 校務 | NULL | 19 |
| 会議 | NULL | 20 |
| 部活動 | NULL | 21 |
| 事務作業 | NULL | 22 |
| その他 | NULL | 23 |

> **既存テナントの移行**: マイグレーションで既存の `is_emotion = true` タグを `type = 'emotion'` に変換。新しいシステムデフォルトタグは既存テナントにも INSERT する（`ON CONFLICT DO NOTHING`）。

---

## 集計用の型定義

### EmotionTrendDataPoint

日ごとの感情カテゴリ集計データ。

```typescript
type EmotionTrendDataPoint = {
  date: string;          // ISO date (YYYY-MM-DD)
  positive: number;      // positive タグの使用回数
  negative: number;      // negative タグの使用回数
  neutral: number;       // neutral タグの使用回数
  total: number;         // 当日の全感情タグ使用回数
};
```

### EmotionTrendResponse

API レスポンス型。

```typescript
type EmotionTrendResponse = {
  period: 'week' | 'month' | 'quarter';
  data: EmotionTrendDataPoint[];
  totalEntries: number;  // 期間内の全エントリ数（グラフ表示判定に使用）
};
```
