# Unit-02 ビジネスルール定義

## エントリ関連ルール（BR-J）

| ルールID | 説明 | 強制層 |
|---|---|---|
| BR-J-01 | 本文（content）は 1〜200文字の範囲で必須 | API（Zod）＋ DB（CHECK制約） |
| BR-J-02 | エントリは必ずテナントとユーザーに紐づく | DB（NOT NULL FK） |
| BR-J-03 | is_public のデフォルトは true（タイムラインに表示） | DB（DEFAULT TRUE） |
| BR-J-04 | エントリの更新・削除は所有者のみ可能 | API（所有者検証）＋ DB（RLS） |
| BR-J-05 | 教員タイムラインは テナント内全教員の `is_public=true` エントリを表示（共有フィード） | API（is_public=true + tenant_id フィルタ）＋ DB（RLS） |
| BR-J-05b | マイ記録は自分の全エントリ（公開・非公開両方）を表示 | API（user_id フィルタ）＋ DB（RLS） |
| BR-J-06 | 1つのエントリに付けられるタグは最大 10件（感情タグ・業務タグ合算） | API（Zod：maxLength(10)） |
| BR-J-08 | `is_public=false` エントリは所有者のみアクセス可。管理職・他教員を含む全ての他ユーザーはアクセス不可 | API（所有者チェック）＋ DB（RLS） |
| BR-J-09 | `is_public=true` エントリはテナント内の全ユーザー（教員・管理職）が教員タイムラインで閲覧可 | API（tenant_id フィルタ） |

---

## タグ関連ルール（BR-T）

| ルールID | 説明 | 強制層 |
|---|---|---|
| BR-T-01 | タグ名は 1〜50文字 | API（Zod） |
| BR-T-02 | タグ名はテナント内で一意（大文字小文字を区別しない） | DB（UNIQUE INDEX on lower(name)） |
| BR-T-03 | タグはテナントスコープ — 認証済み教員であれば誰でも作成可 | API（ロール検証: teacher以上） |
| BR-T-04 | テナント内の全タグは同テナントの全ユーザーが参照できる | API（tenant_id フィルタのみ） |
| BR-T-05 | `is_system_default=false` タグの削除は `school_admin` のみ可能。CASCADE で紐づき削除。エントリ本体は残る | API（ロール検証: school_admin）＋ DB（ON DELETE CASCADE） |
| BR-T-05b | `is_system_default=true` タグは削除不可 | API（is_system_default チェック） |
| BR-T-05c | 一般教員はタグを削除できない（作成のみ可） | API（ロール検証） |
| BR-T-06 | エントリ作成・編集時、テナント内の全タグをボタン一覧で表示し選択できる | フロントエンド |
| BR-T-07 | `is_emotion=true` タグは感情系（Unit-04 の統計集計に使用）。`is_emotion=false` は業務系タグ | DB フラグ（UIでは区別なく表示） |
| BR-T-08 | 教員が新規作成するタグは `is_emotion=false`・`is_system_default=false` がデフォルト | API（デフォルト値） |

---

## タイムライン関連ルール（BR-TL）

| ルールID | 説明 | 強制層 |
|---|---|---|
| BR-TL-01 | 並び順は created_at DESC（最新エントリが先頭） | API（ORDER BY） |
| BR-TL-02 | ページあたり 20件 | API（LIMIT） |
| BR-TL-03 | ページ番号は 1 以上の整数（0 以下は拒否） | API（Zod） |
| BR-TL-04 | エントリカードに表示: 作成日時・本文冒頭50文字・タグ一覧・感情カテゴリ一覧 | API（レスポンス成形） |
| BR-TL-05 | 本文が50文字超の場合は 50文字 ＋「…」で省略 | フロントエンド |

---

## 公開設定ルール（BR-V）

| ルールID | 説明 | 強制層 |
|---|---|---|
| BR-V-01 | is_public = false のエントリは所有者のみ参照可（「自分だけに保存」選択時） | API ＋ DB（RLS） |
| BR-V-02 | is_public = true（デフォルト）のエントリは教員自身のタイムラインに表示。Phase 3 で同テナント教員にも公開 | フロントエンド（Phase 1 では自分のタイムラインのみ） |
| BR-V-03 | 「自分だけに保存」チェックなし（デフォルト）→ is_public = true、チェックあり → is_public = false | フロントエンド（送信時にマッピング） |

---

## セキュリティルール（BR-SEC）

Unit-01 から継承・拡張する Unit-02 固有のセキュリティルール：

| ルールID | 説明 | 参照 |
|---|---|---|
| BR-SEC-J-01 | 全 Journal API は withTenant() を必須とする。更新・削除は所有者検証も必須 | SECURITY-08（IDOR防止） |
| BR-SEC-J-02 | `is_public=false` エントリ本文・感情データは要保護情報 — ログへの出力禁止・所有者以外への返却禁止 | NFR-01-EX-1 |
| BR-SEC-J-03 | タグ・カテゴリの入力は Zod スキーマで検証する | SECURITY-05 |
| BR-SEC-J-04 | 他テナントのエントリ・タグ・カテゴリへのアクセスは API ＋ DB 両層で拒否 | NFR-05 |

---

## バリデーションスキーマ（Zod）

```typescript
// エントリ作成・更新（タグIDのみ、感情カテゴリは統合）
export const createEntrySchema = z.object({
  content: z.string().min(1).max(200),
  tagIds: z.array(z.string().uuid()).max(10).default([]),
  isPublic: z.boolean().default(true),
});

// タグ作成（教員）
export const createTagSchema = z.object({
  name: z.string().min(1).max(50).trim(),
  // is_emotion / is_system_default は教員作成時は常に false（API 側で固定）
});

// タイムラインクエリ
export const timelineQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
});
```
