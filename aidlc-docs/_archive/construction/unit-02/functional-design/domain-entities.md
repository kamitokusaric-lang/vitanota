# Unit-02 ドメインエンティティ定義

## エンティティ一覧

| エンティティ | 説明 | 所有ユニット |
|---|---|---|
| JournalEntry | 日誌エントリ | Unit-02 |
| Tag | タグ（感情系・業務系を統合） | Unit-02 |
| JournalEntryTag | エントリとタグの中間テーブル | Unit-02 |

> **統合変更**: 当初 `EmotionCategory` / `JournalEntryEmotion` を別テーブルで設計していたが、`Tag` に `is_emotion` フラグを追加して統合。テーブル数を削減しシンプル化。

---

## JournalEntry（日誌エントリ）

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | エントリID |
| tenant_id | UUID | FK→tenants NOT NULL | テナントID（RLS キー） |
| user_id | UUID | FK→users NOT NULL | 作成者ID |
| content | TEXT | NOT NULL, CHECK(length <= 200) | 本文（最大200文字） |
| is_public | BOOLEAN | NOT NULL DEFAULT TRUE | true（デフォルト）= タイムラインに表示、false = 自分のみ（非公開） |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | 作成日時 |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | 更新日時 |

**インデックス**:
- `(tenant_id, user_id, created_at DESC)` — タイムライン取得
- `(tenant_id, is_public, created_at DESC)` — 共有タイムライン取得

**RLS ポリシー**:
```sql
-- 共有タイムライン: is_public=true はテナント内全員が参照可
CREATE POLICY journal_entry_public ON journal_entries
  FOR SELECT
  USING (
    is_public = true
    AND tenant_id = current_setting('app.tenant_id', true)::uuid
  );

-- マイ記録: 所有者は自分の全エントリ（公開・非公開）を参照可
CREATE POLICY journal_entry_owner ON journal_entries
  USING (
    user_id = current_setting('app.user_id', true)::uuid
    AND tenant_id = current_setting('app.tenant_id', true)::uuid
  );
```

**全文検索への拡張性備え**（要件 FR-03 拡張性ノート）:
```sql
-- Phase 2 以降で追加可能（スキーマ変更なし）
ALTER TABLE journal_entries ADD COLUMN content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('japanese', content)) STORED;
CREATE INDEX journal_entries_content_tsv_idx ON journal_entries USING GIN(content_tsv);
```

---

## Tag（タグ）

感情系タグ（うれしい・つかれた等）と業務系タグ（授業準備・保護者対応等）を統合したテーブル。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | タグID |
| tenant_id | UUID | FK→tenants NOT NULL | テナントID |
| name | VARCHAR(50) | NOT NULL | タグ名 |
| is_emotion | BOOLEAN | NOT NULL DEFAULT FALSE | true = 感情系タグ（Unit-04 の統計集計で使用） |
| is_system_default | BOOLEAN | NOT NULL DEFAULT FALSE | true = テナント作成時に自動シード。削除不可 |
| sort_order | INTEGER | NOT NULL DEFAULT 0 | 表示順（システムデフォルトタグの並び順に使用） |
| created_by | UUID | FK→users | 作成者（NULL = システムシード） |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | 作成日時 |

**ユニーク制約**:
```sql
CREATE UNIQUE INDEX tags_tenant_name_lower_idx
  ON tags (tenant_id, lower(name));
```

**インデックス**:
- `(tenant_id, is_emotion)` — 感情タグ絞り込み（Unit-04 統計用）
- `(tenant_id, sort_order)` — 表示順取得

**システムデフォルトシードデータ**（テナント作成時に各テナントへ自動挿入）:

| name | is_emotion | sort_order |
|---|---|---|
| うれしい | true | 1 |
| つかれた | true | 2 |
| やってみた | true | 3 |
| 行き詰まり | true | 4 |
| 相談したい | true | 5 |
| 授業準備 | false | 6 |
| 保護者対応 | false | 7 |
| 行事準備 | false | 8 |

---

## JournalEntryTag（エントリ–タグ 中間テーブル）

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| tenant_id | UUID | NOT NULL | テナントID（冗長列、複合 FK でクロステナント参照を物理防止） |
| entry_id | UUID | NOT NULL | エントリID（`(entry_id, tenant_id)` で journal_entries を参照） |
| tag_id | UUID | NOT NULL | タグID（`(tag_id, tenant_id)` で tags を参照） |

**主キー**: `(entry_id, tag_id)`

**複合 FK 設計（SP-U02-04 Layer 8 クロステナント参照物理防止）**:
```sql
FOREIGN KEY (entry_id, tenant_id)
  REFERENCES journal_entries(id, tenant_id) ON DELETE CASCADE,
FOREIGN KEY (tag_id, tenant_id)
  REFERENCES tags(id, tenant_id) ON DELETE CASCADE
```

このため親テーブル側に補助 UNIQUE 制約が必要：
```sql
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_id_tenant_unique UNIQUE (id, tenant_id);
ALTER TABLE tags ADD CONSTRAINT tags_id_tenant_unique UNIQUE (id, tenant_id);
```

**効果**:
- テナント A のエントリにテナント B のタグを紐づけようとすると DB エンジンが FK violation で拒否
- アプリコードのバグ・RLS の穴・生 SQL 実行のいずれに対しても物理的に無効化
- SP-U02-04 多層防御の Layer 8 として機能

**CASCADE 設計**:
- entry 削除 → 紐づき削除（エントリと一緒にタグ関連も消える）
- tag 削除（school_admin のみ可、is_system_default=false のみ）→ 紐づき削除（エントリ本体は影響なし）

---

## エンティティ関係図

```
tenants (Unit-01)
  |
  +-- users (Unit-01)
  |     |
  |     +-- journal_entries (Unit-02)
  |           |-- is_public: bool (default true)
  |           |-- content: text (max 200)
  |           |
  |           +--[journal_entry_tags]-- tags
  |                                     |-- is_emotion: bool (感情系/業務系の区別)
  |                                     |-- is_system_default: bool (削除不可フラグ)
  |                                     |-- tenant_id (テナントスコープ)
  |
  +-- tags (is_system_default=true はテナント作成時に自動シード)
```

---

## Drizzle ORM スキーマ追加分

```typescript
// src/db/schema.ts に追記

export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  isPublic: boolean('is_public').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 50 }).notNull(),
  isEmotion: boolean('is_emotion').notNull().default(false),
  isSystemDefault: boolean('is_system_default').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const journalEntryTags = pgTable('journal_entry_tags', {
  tenantId: uuid('tenant_id').notNull(),
  entryId: uuid('entry_id').notNull(),
  tagId: uuid('tag_id').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.entryId, t.tagId] }),
  // 複合 FK: クロステナント参照の物理防止（SP-U02-04 Layer 8）
  entryFk: foreignKey({
    columns: [t.entryId, t.tenantId],
    foreignColumns: [journalEntries.id, journalEntries.tenantId],
    name: 'journal_entry_tags_entry_fk',
  }).onDelete('cascade'),
  tagFk: foreignKey({
    columns: [t.tagId, t.tenantId],
    foreignColumns: [tags.id, tags.tenantId],
    name: 'journal_entry_tags_tag_fk',
  }).onDelete('cascade'),
}));

// 親テーブル側の複合 UNIQUE 制約（別マイグレーションで追加）
// ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_id_tenant_unique UNIQUE (id, tenant_id);
// ALTER TABLE tags ADD CONSTRAINT tags_id_tenant_unique UNIQUE (id, tenant_id);
```
