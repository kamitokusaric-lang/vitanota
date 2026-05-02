# 2026-05-07 教員向け説明会向け機能追加 — アプリケーション設計

> **対応要件**: [`inception/requirements/2026-05-07-meeting-features.md`](../requirements/2026-05-07-meeting-features.md)
> **対応プラン**: [`inception/plans/2026-05-07-meeting-features-plan.md`](../plans/2026-05-07-meeting-features-plan.md)
> **作成日**: 2026-05-02

## 設計方針

- **既存パターンに合わせる**: RLS は `migrations/0009_rls_role_separation.sql` の CASE 式 + ヘルパー関数 (`app_role()`, `app_tenant_id()`, `app_user_id()`) に準拠
- **デフォルト拒否**: `app_role() IS NULL` と `ELSE` で必ず false に倒す
- **過剰設計禁止**: 5/7 までのスコープに収まる範囲 (FK 強制 + 必要 index のみ)
- **新規ユニットなし**: 既存 Unit-01 (auth) / Unit-04 (admin) / Unit-05 (tasks) を拡張

---

## 機能 A: 招待管理画面 (system_admin)

### 画面構成 — `pages/admin/invitations.tsx`

```
┌────────────────────────────────────────────────────────────────┐
│ 招待管理 [system_admin only]                                     │
├────────────────────────────────────────────────────────────────┤
│ テナント選択: [▼ Cozi73 中学校 (UUID: ...)        ]              │
├────────────────────────────────────────────────────────────────┤
│ ── 一括招待 ──                                                  │
│ ┌────────────────────────────────────────────────────┐          │
│ │ teacher1@example.com                               │          │
│ │ teacher2@example.com                               │          │
│ │ teacher3@example.com                               │          │
│ │ ...                                                │          │
│ └────────────────────────────────────────────────────┘          │
│ [全員 teacher として一括招待] [全員 school_admin として招待]      │
│                                                                │
│ ✅ 投入結果: 25 件成功 / 0 件失敗                                 │
├────────────────────────────────────────────────────────────────┤
│ ── 招待一覧 ──                                                  │
│ ┌──────────┬──────┬────────┬────────┬────────┬──────────────┐ │
│ │ Email    │ロール │ 招待日 │ 期限   │ステータス│ 招待 URL     │ │
│ ├──────────┼──────┼────────┼────────┼────────┼──────────────┤ │
│ │ t1@...   │teacher│ 5/2   │ 5/9   │ ✅ 受諾済(5/3)│ -        │ │
│ │ t2@...   │teacher│ 5/2   │ 5/9   │ ⏳ 未受諾    │ [📋 コピー] │ │
│ │ t3@...   │teacher│ 4/25  │ 5/2   │ ⌛ 期限切れ  │ [🔄 再発行] │ │
│ └──────────┴──────┴────────┴────────┴────────┴──────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### コンポーネント分解
- `<TenantSelector>` — テナント選択ドロップダウン (`/api/system/tenants` から取得)
- `<BulkInviteForm>` — textarea + ロール選択ボタン + 投入結果表示
- `<InvitationsTable>` — 一覧テーブル + ステータスバッジ + コピー / 再発行ボタン

### データフロー
1. 初回ロード: `GET /api/system/tenants` → テナント一覧取得 → デフォルト先頭選択
2. テナント選択時: `GET /api/system/invitations?tenantId=xxx` → 一覧表示
3. 一括投入: textarea パース (改行 / カンマ split + trim + email validate) → `POST /api/system/invitations` → 結果反映 + 一覧再取得
4. コピー: `navigator.clipboard.writeText(inviteUrl)` (フォールバックなし、モダンブラウザ前提)
5. 再発行: `POST /api/system/invitations` を 1 件で呼び出し (既存重複ロジック起動)

### API シグネチャ

#### `GET /api/system/invitations?tenantId={uuid}`
**Request**: query param `tenantId` (必須)
**Response 200**:
```json
{
  "invitations": [
    {
      "id": "uuid",
      "email": "teacher@example.com",
      "role": "teacher",
      "invitedAt": "2026-05-02T10:00:00Z",
      "expiresAt": "2026-05-09T10:00:00Z",
      "usedAt": null,
      "status": "pending",
      "inviteUrl": "https://vitanota.io/auth/invite?token=..."
    }
  ]
}
```
**status 計算ロジック (サーバ側)**:
- `usedAt IS NOT NULL` → `accepted` (acceptedAt = usedAt)
- `usedAt IS NULL AND expiresAt > NOW()` → `pending`
- `usedAt IS NULL AND expiresAt <= NOW()` → `expired`

**権限**: session に `system_admin` ロール必須、それ以外 403

#### `POST /api/system/invitations`
**Request body**:
```json
{
  "tenantId": "uuid",
  "emails": ["t1@example.com", "t2@example.com"],
  "role": "teacher"
}
```
**Response 200**:
```json
{
  "results": [
    { "email": "t1@example.com", "status": "created", "invitation": { "id": "...", "inviteUrl": "..." } },
    { "email": "t2@example.com", "status": "failed", "error": "INVALID_EMAIL" }
  ]
}
```
**バリデーション**:
- `emails` array length: 1〜100 (Zod)
- 各 email: RFC 形式 (Zod `.email()`)
- `role`: `teacher | school_admin` のみ
- 全件失敗でも 200 で返す (個別 status で判別)

**重複処理**: 既存 `pages/api/invitations/index.ts` の「重複招待は古いトークン無効化 + 新規発行」ロジックを内部関数化 (`createOrReissueInvitation`) して再利用

---

## 機能 B: フィードバック

### B-1. DB スキーマ

#### `feedback_topics` テーブル
```sql
CREATE TABLE feedback_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 教員 UI のトピック取得用 (is_active=true のみ + sort_order ソート)
CREATE INDEX feedback_topics_active_sort_idx
  ON feedback_topics(sort_order)
  WHERE is_active = true;
```

#### `feedback_submissions` テーブル
```sql
CREATE TABLE feedback_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES feedback_topics(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 投稿一覧画面のトピック別フィルタ + 時系列降順
CREATE INDEX feedback_submissions_tenant_created_idx
  ON feedback_submissions(tenant_id, created_at DESC);

-- トピック削除可否判定 (投稿数 COUNT) 用
CREATE INDEX feedback_submissions_topic_idx
  ON feedback_submissions(topic_id);
```

**FK 設計のポイント**:
- `topic_id` → `feedback_topics.id` ON DELETE **RESTRICT**: 投稿があるトピックの物理削除を DB レベルで防御 (要件 AC-B-08 のハイブリッド削除)
- `user_id` → `users.id` ON DELETE **CASCADE**: 退会時に投稿も削除 (今回の MVP スコープ。匿名化対応は post-MVP)
- `tenant_id` → `tenants.id` ON DELETE **CASCADE**: テナント削除時に投稿も消える (整合性優先)

### B-2. RLS 設計

#### `feedback_topics`
```sql
ALTER TABLE feedback_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_topics FORCE ROW LEVEL SECURITY;

-- SELECT: 全認証ロール可 (教員も active トピック取得が必要)
CREATE POLICY feedback_topics_read ON feedback_topics
  FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'system_admin' THEN true
      WHEN app_role() = 'school_admin' THEN true
      WHEN app_role() = 'teacher'      THEN true
      WHEN app_role() IS NULL          THEN false
      ELSE false
    END
  );

-- INSERT/UPDATE/DELETE: system_admin のみ
CREATE POLICY feedback_topics_write ON feedback_topics
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'system_admin' THEN true
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin' THEN true
      ELSE false
    END
  );
```

**ポイント**: `FOR ALL` と `FOR SELECT` を併用することで、SELECT 時は両ポリシーが OR 評価される (PostgreSQL RLS 標準挙動、既存 `journal_entries` と同じパターン)。teacher は read のみ、system_admin は read + write 全権。

#### `feedback_submissions`
```sql
ALTER TABLE feedback_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_submissions FORCE ROW LEVEL SECURITY;

-- SELECT: system_admin のみ (裏テーマ防御の要)
CREATE POLICY feedback_submissions_read ON feedback_submissions
  FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'system_admin' THEN true
      ELSE false
    END
  );

-- INSERT: teacher / school_admin / system_admin 可
-- WITH CHECK: tenant_id と user_id を session 値と一致させて強制 (なりすまし防止)
CREATE POLICY feedback_submissions_insert ON feedback_submissions
  FOR INSERT
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin' THEN true
      WHEN app_role() = 'school_admin' THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() = 'teacher'      THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL          THEN false
      ELSE false
    END
  );

-- UPDATE / DELETE: 誰もできない (ポリシー未定義 = デフォルト拒否)
-- 「投稿の編集 / 削除」は Out of scope (要件で明示)
```

**裏テーマ防御の物理的保証**:
- teacher / school_admin は SELECT ポリシーがないので、自分の投稿すら DB から取れない (UI 側にも履歴を出さない設計と整合)
- system_admin だけが全件 SELECT 可
- 万が一アプリケーション層のバグでクロスロール SELECT を試みても、DB が物理的に拒否

### B-3. 投稿画面 — `pages/feedback/new.tsx` (or ダッシュボードモーダル)

```
┌──────────────────────────────────────────────────────────┐
│ フィードバックを送る                              [×]      │
├──────────────────────────────────────────────────────────┤
│ ℹ️ 運営にだけ届きます (同じ学校の先生方には見えません)      │
│                                                          │
│ トピック:                                                 │
│ ○ 改善してほしい点                                         │
│ ○ あったら嬉しい機能                                       │
│ ○ その他なんでも感想や質問                                  │
│                                                          │
│ ── 改善してほしい点 ──                                    │
│ ヒント: 操作で迷った場所、分かりにくい言葉、不便だった点など  │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ (textarea)                                           │ │
│ │                                                      │ │
│ │                                                      │ │
│ │                                          0 / 5000    │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│                                       [キャンセル] [送信] │
└──────────────────────────────────────────────────────────┘
```

**コンポーネント**:
- `<FeedbackForm>` — トピック radio + ヒント文表示 + textarea + 送信ボタン
- `<FeedbackEntryPoint>` — ダッシュボード共通ヘッダーに配置する「フィードバックを送る」ボタン

**データフロー**:
1. `GET /api/feedback/topics` → is_active=true のトピックを sort_order ASC で取得
2. トピック選択 → 該当トピックの description (ヒント文) を表示
3. textarea 入力 → 文字数 counter リアルタイム更新
4. 送信 → `POST /api/feedback/submissions` → 成功時「ありがとうございました」モーダル → 自動クローズ

### B-4. system_admin 投稿一覧 — `pages/admin/feedback.tsx`

```
┌────────────────────────────────────────────────────────────────────┐
│ フィードバック投稿一覧 [system_admin only]   [→ トピック管理]       │
├────────────────────────────────────────────────────────────────────┤
│ フィルタ:                                                           │
│ テナント [▼ 全テナント   ]  トピック [▼ 全トピック   ]               │
├────────────────────────────────────────────────────────────────────┤
│ ┌────────┬────────┬────────────┬────────┬─────────────────────┐  │
│ │ 投稿日時│トピック │ 投稿者      │テナント │ 本文                  │  │
│ ├────────┼────────┼────────────┼────────┼─────────────────────┤  │
│ │ 5/8 14:32│改善してほしい点│ t1@...│ Cozi73 │ タスク作成画面が...    │  │
│ │ 5/8 15:01│あったら嬉しい機能│t2@..│ Cozi73 │ タスクに色分け...     │  │
│ └────────┴────────┴────────────┴────────┴─────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### B-5. system_admin トピック CRUD — `pages/admin/feedback/topics.tsx`

```
┌──────────────────────────────────────────────────────────────────────────┐
│ トピック管理 [system_admin only]   [← 投稿一覧]    [+ 新規追加]            │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────┬──────────┬─────┬──────┬──────┬─────────────────┐│
│ │ Title              │ヒント文 (略)│順序 │有効 │投稿数│ 操作              ││
│ ├────────────────────┼──────────┼─────┼──────┼──────┼─────────────────┤│
│ │ 改善してほしい点      │ 操作で...   │ 10  │ ✅   │  12  │ [編集][無効化]    ││
│ │ あったら嬉しい機能    │ こういう... │ 20  │ ✅   │   8  │ [編集][無効化]    ││
│ │ その他...           │ -          │ 30  │ ✅   │   3  │ [編集][無効化]    ││
│ │ 古いお題 (実験)      │ -          │ 99  │ ❌   │   0  │ [編集][🗑️ 削除]   ││
│ └────────────────────┴──────────┴─────┴──────┴──────┴─────────────────┘│
└──────────────────────────────────────────────────────────────────────────┘
```

**条件付き表示**:
- 投稿数 = 0: 「削除」ボタン (`DELETE /api/system/feedback/topics/[id]`)
- 投稿数 > 0: 「無効化」ボタン (`PATCH ... { isActive: false }`)
- 既に無効化済 (is_active=false) の表示: 「有効化」ボタン (`PATCH ... { isActive: true }`) に切り替え

**新規追加 / 編集モーダル**:
```
┌───────────────────────────────────┐
│ トピック新規追加 / 編集           [×]│
├───────────────────────────────────┤
│ Title (必須):                      │
│ [____________________________]    │
│                                   │
│ ヒント文 (任意、教員 UI に表示):     │
│ [____________________________]    │
│ [                              ]   │
│                                   │
│ 表示順 (数値、小さい順に表示):       │
│ [10]                              │
│                                   │
│ 公開状態:                          │
│ ⦿ 有効 (教員に表示)                │
│ ○ 無効 (新規投稿不可、既存投稿は閲覧可)│
│                                   │
│              [キャンセル] [保存]    │
└───────────────────────────────────┘
```

### B-6. API シグネチャ一覧

| Method | Path | 権限 | 用途 |
|---|---|---|---|
| GET | `/api/feedback/topics` | 認証済み (全ロール) | 教員 UI 用、is_active=true のみ |
| POST | `/api/feedback/submissions` | 認証済み (teacher / school_admin / system_admin) | 投稿 |
| GET | `/api/system/feedback` | system_admin | 全投稿一覧、フィルタ対応 |
| GET | `/api/system/feedback/topics` | system_admin | CRUD UI 用、全トピック + 投稿数 |
| POST | `/api/system/feedback/topics` | system_admin | 新規追加 |
| PATCH | `/api/system/feedback/topics/[id]` | system_admin | 編集 (部分更新) |
| DELETE | `/api/system/feedback/topics/[id]` | system_admin | 投稿数 = 0 時のみ 200、> 0 は 409 |

### B-7. seed SQL — `migrations/seed-feedback-topics.sql`
```sql
-- idempotent: 既存があれば何もしない (memory: seed 安全方針)
INSERT INTO feedback_topics (title, description, sort_order, is_active)
VALUES
  ('改善してほしい点', '操作で迷った場所、分かりにくい言葉、不便だった点など', 10, true),
  ('あったら嬉しい機能', '「こういう機能があれば使ってみたい」と感じたものがあれば', 20, true),
  ('その他なんでも感想や質問', '自由にどうぞ', 30, true)
ON CONFLICT DO NOTHING;
```
※ feedback_topics に title 単独 UNIQUE 制約はないので `ON CONFLICT DO NOTHING` は実質 idempotent ガードにならない → **seed は本番では 1 回限り手動実行**で運用 (chimo 確認済の手動方式)

---

## 機能 C: タスク複製

### C-1. API: `POST /api/tasks/[id]/duplicate`
**Request body**:
```json
{ "ownerUserId": "uuid" }
```
**Response 201**:
```json
{
  "task": {
    "id": "新タスクの uuid",
    "tenantId": "...",
    "categoryId": "元と同じ",
    "ownerUserId": "新規選択した user の id",
    "createdBy": "複製操作者の user_id",
    "title": "元タスクのコピー",
    "description": "元タスクのコピー",
    "dueDate": "元タスクのコピー",
    "status": "todo",
    "completedAt": null,
    "createdAt": "now()",
    "updatedAt": "now()"
  }
}
```

**サーバ側ロジック**:
1. 元タスクを SELECT (RLS で同テナントのみ取得可、cross-tenant は物理拒否)
2. ownerUserId が同テナント内の user か検証 (`SELECT 1 FROM user_tenant_roles WHERE user_id = ? AND tenant_id = ?`)
3. INSERT (元の title / description / category_id / due_date を継承、status='todo' / completed_at=null)
4. レスポンス返す

### C-2. UI フロー
```
TaskBoard / TaskCard
   ↓ クリック「複製」
複製モーダル (TaskForm を流用)
   ├ title / description / category / due_date: 元タスクからプリフィル (編集可)
   └ owner_user_id: 空欄 (必須)
   ↓ 「複製」ボタン
POST /api/tasks/[id]/duplicate
   ↓ 201
TaskBoard 再取得 + 成功 toast
```

### C-3. 影響を受ける既存ファイル
- `src/features/tasks/components/TaskBoard.tsx` — タスクカードに複製ボタン追加
- `src/features/tasks/components/TaskForm.tsx` — 複製モード追加 (props で `mode: 'create' | 'edit' | 'duplicate'` を受ける)

---

## ER 差分図 (新規 2 テーブルの位置付け)

```
                    ┌──────────┐
                    │ tenants  │
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
              ▼          ▼          ▼
          ┌──────┐  ┌────────┐  ┌────────────────────┐
          │users │  │ tasks  │  │ feedback_submissions│  ← 新規
          └──┬───┘  └────────┘  └─────┬──────────────┘
             │                        │
             └────────────────────────┤
                                      │
                                      ▼
                         ┌──────────────────┐
                         │ feedback_topics  │  ← 新規
                         │  (テナント横断)   │
                         └──────────────────┘
```

**ポイント**:
- `feedback_topics` はテナントに紐付かない (運営側マスタ、全テナント共通)
- `feedback_submissions` は tenant_id を持ち、teacher / school_admin の自テナント書き込みのみ
- system_admin は両方フル権限 (運営者として全テナント横断で管理)

---

## 既存ファイルへの影響まとめ

| ファイル | 変更内容 | 影響範囲 |
|---|---|---|
| `pages/admin/tenants.tsx` | 各行に「招待管理」リンク追加 | UI のみ |
| `pages/api/invitations/index.ts` | 変更なし (school_admin 経路として残置) | - |
| `src/db/schema.ts` | `feedbackTopics` / `feedbackSubmissions` 追加 | スキーマ拡張 |
| `src/features/tasks/components/TaskBoard.tsx` | 複製ボタン追加 | UI |
| `src/features/tasks/components/TaskForm.tsx` | 複製モード追加 | UI |
| `src/features/dashboard/components/*` | フィードバック導線追加 (1 ヶ所) | UI |

## 新規ファイル一覧

| ファイル | 用途 |
|---|---|
| `migrations/00XX_feedback_topics_and_submissions.sql` | DB 拡張 |
| `migrations/seed-feedback-topics.sql` | 初期トピック 3 件 |
| `pages/admin/invitations.tsx` | 招待管理画面 |
| `pages/admin/feedback.tsx` | 投稿一覧 |
| `pages/admin/feedback/topics.tsx` | トピック CRUD |
| `pages/feedback/new.tsx` (or モーダル) | 教員用投稿フォーム |
| `pages/api/system/invitations/index.ts` | GET 一覧 / POST bulk |
| `pages/api/system/feedback/index.ts` | GET 投稿一覧 |
| `pages/api/system/feedback/topics/index.ts` | GET / POST トピック |
| `pages/api/system/feedback/topics/[id].ts` | PATCH / DELETE トピック |
| `pages/api/feedback/topics.ts` | 教員用 GET active トピック |
| `pages/api/feedback/submissions.ts` | 教員用 POST 投稿 |
| `pages/api/tasks/[id]/duplicate.ts` | タスク複製 |

## 参照
- 要件: [`inception/requirements/2026-05-07-meeting-features.md`](../requirements/2026-05-07-meeting-features.md)
- 実装プラン: [`inception/plans/2026-05-07-meeting-features-plan.md`](../plans/2026-05-07-meeting-features-plan.md)
- 既存 RLS パターン: `migrations/0009_rls_role_separation.sql`
- 既存招待 API: `pages/api/invitations/index.ts`
- 既存タスクスキーマ: `migrations/0014_unit05_task_core.sql`
