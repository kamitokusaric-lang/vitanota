# Unit-02 データベーススキーマサマリー

**ER 図**: `aidlc-docs/construction/er-diagram.md`（Mermaid・テーブル全体図）
**Drizzle 定義**: `src/db/schema.ts`
**マイグレーション**: `migrations/0002〜0005_unit02_*.sql`

## Unit-02 で追加したオブジェクト

### テーブル

| 名前 | 種別 | 用途 | RLS |
|---|---|---|---|
| `sessions` | TABLE | Auth.js database セッション戦略（SP-07） | 所有者 SELECT |
| `verification_tokens` | TABLE | Auth.js 標準（メール検証用） | なし |
| `journal_entries` | TABLE | 日誌エントリ本体 | 2ポリシー（public_read + owner_all） |
| `tags` | TABLE | タグ（is_emotion で感情/業務統合） | tenant_read + tenant_write |
| `journal_entry_tags` | TABLE | エントリ × タグ中間（複合 FK） | tenant スコープ |

### VIEW

| 名前 | 用途 | 特性 |
|---|---|---|
| `public_journal_entries` | 共有タイムライン専用 VIEW | `WHERE is_public=true` を内包・`is_public` 列を露出しない・`security_barrier=true` |

## 主要制約

### 複合 UNIQUE（SP-U02-04 Layer 8 の参照先）

```sql
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_id_tenant_unique UNIQUE (id, tenant_id);
ALTER TABLE tags             ADD CONSTRAINT tags_id_tenant_unique             UNIQUE (id, tenant_id);
```

### 複合 FK（SP-U02-04 Layer 8: クロステナント参照物理防止）

```sql
journal_entry_tags の制約:
  FOREIGN KEY (entry_id, tenant_id) REFERENCES journal_entries(id, tenant_id) ON DELETE CASCADE
  FOREIGN KEY (tag_id, tenant_id)   REFERENCES tags(id, tenant_id)            ON DELETE CASCADE
```

**効果**: アプリのバグ・生 SQL のいずれでも、テナント A のエントリにテナント B のタグを紐づけることが DB エンジンレベルで物理的に不可能。

### Case-Insensitive UNIQUE

```sql
CREATE UNIQUE INDEX tags_tenant_name_lower_idx ON tags (tenant_id, lower(name));
```
- 同一テナント内で「うれしい」と「うれしい」（半角/全角等）の重複も防止

## RLS ポリシー

### journal_entries（SP-U02-02 2ポリシー構成）

```sql
-- ポリシー1: 共有タイムライン（PERMISSIVE OR 結合）
CREATE POLICY journal_entry_public_read ON journal_entries
  AS PERMISSIVE FOR SELECT
  USING (is_public = true AND tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ポリシー2: 所有者アクセス
CREATE POLICY journal_entry_owner_all ON journal_entries
  AS PERMISSIVE FOR ALL
  USING (user_id = current_setting('app.user_id', true)::uuid
         AND tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid
              AND tenant_id = current_setting('app.tenant_id', true)::uuid);
```

**評価結果**: `tenant_match AND (is_public OR user_match)`

### Fail-safe 設計

`current_setting('app.tenant_id', true)` の第2引数 `true` は missing_ok。
セッション変数未設定時 → NULL → uuid キャスト比較が偽 → **全拒否**（安全側）。

### tags / journal_entry_tags

```sql
CREATE POLICY tags_tenant_read   ON tags   AS PERMISSIVE FOR SELECT USING (tenant_id = ...);
CREATE POLICY tags_tenant_write  ON tags   AS PERMISSIVE FOR ALL    USING (...) WITH CHECK (...);
CREATE POLICY journal_entry_tags_tenant ON journal_entry_tags AS PERMISSIVE FOR ALL ...;
```

### sessions

```sql
CREATE POLICY sessions_owner_read ON sessions
  AS PERMISSIVE FOR SELECT
  USING (user_id = current_setting('app.user_id', true)::uuid);
```

## インデックス

| インデックス | 用途 |
|---|---|
| `journal_entries_tenant_created_idx (tenant_id, created_at DESC)` | 共有タイムラインのソート |
| `journal_entries_user_created_idx (user_id, created_at DESC)` | マイ記録のソート |
| `tags_tenant_emotion_idx (tenant_id, is_emotion)` | Unit-04 統計用 |
| `tags_tenant_name_lower_idx (tenant_id, lower(name)) UNIQUE` | 大小文字無視重複防止 |
| `journal_entry_tags_tenant_idx (tenant_id)` | テナントフィルタ |
| `journal_entry_tags_tag_idx (tag_id)` | タグ削除時の影響範囲取得 |
| `sessions_user_id_idx` / `sessions_tenant_id_idx` / `sessions_expires_idx` | Auth.js ルックアップ・期限切れ検索 |

## マイグレーション一覧

| No | ファイル | 内容 |
|---|---|---|
| 0002 | `migrations/0002_unit02_sessions.sql` | sessions + verification_tokens + RLS（Unit-01 遡及） |
| 0003 | `migrations/0003_unit02_journal_core.sql` | 3テーブル + 複合 UNIQUE + 複合 FK + インデックス |
| 0004 | `migrations/0004_unit02_journal_rls.sql` | RLS ポリシー（SP-U02-02） |
| 0005 | `migrations/0005_unit02_public_view.sql` | public_journal_entries VIEW + security_barrier |

## 運用上の注意

### R1 RDS Proxy ピンニング対策

すべての DB アクセスは `withTenantUser(tenantId, userId, fn)` 経由で `db.transaction` 内で実行され、`set_config(name, value, **true**)` でローカル（トランザクション）スコープに限定される。

これにより:
- トランザクション終了時に自動リセット → セッション変数の漏れ防止
- RDS Proxy がピンしない → 接続多重化を維持

### ローリングデプロイ中のマイグレーション競合（R7）

マイグレーションは Lambda マイグレーター（Unit-01）から App Runner デプロイ前に必ず実行する。後方互換性のない変更は別マイグレーションとして段階適用する。

## 関連ドキュメント

- ER 図: `aidlc-docs/construction/er-diagram.md`
- 機能設計: `aidlc-docs/construction/unit-02/functional-design/domain-entities.md`
- NFR 設計: `aidlc-docs/construction/unit-02/nfr-design/nfr-design-patterns.md`
- 運用リスク: `aidlc-docs/construction/unit-02/nfr-design/operational-risks.md`
