# tasks — 複数アサイン・委譲 (依頼中)

> 親: [overview.md](./overview.md)。CRUD は [task-crud.md](./task-crud.md)。実装: `src/features/tasks/lib/taskRepository.ts`, `components/TaskForm.tsx`/`TaskCard.tsx`。
> 設計の経緯: 旧 `tasks.owner_user_id` (単一所有者) を `task_assignees` (M:N) に一本化した (migration 0026)。

## データ構造

`task_assignees` テーブル — PK `(task_id, user_id, tenant_id)`。task_id → tasks は CASCADE、user_id → users。1 タスクに複数教員を割当でき、status は全員で共有する (個別進捗ではない)。

## scope='mine' の定義

タスク一覧で「自分のタスク」を取るときの定義:

```
自分が assignees に含まれる  OR  created_by = self
```

→ 自分が作って他人に振った「依頼中」タスクも、自分の一覧に出る。

## 委譲 (依頼中) の判定

```
delegated = (created_by === selfUserId) && !assignees.some(a => a.userId === selfUserId)
```

「自分が作ったが、自分は担当者ではない」= 他の先生に振ったタスク。

- TaskCard では色違い表示 (amber 系の左ボーダー) で「依頼中」と分かる
- TaskBoard の「依頼中も表示」トグル (`showDelegated`) で表示・非表示を切替

### 委譲フローの例
1. 教員 A がタスク作成、assignees に B, C を指定
2. A の視点: `delegated=true` で色違い表示
3. B, C の視点: `scope='mine'` の一覧に自動で出る
4. A が自分も assignees に追加 → `delegated` が消える (自分も担当になったため)

## 担当者の表示

`TaskCard` の `formatAssignees`:
- 3 名以下: 全員の名前 (カンマ区切り)
- 4 名以上: 最初 2 名 + "+N" (例: "田中, 佐藤 +2")

## バリデーションと検証

- `assigneeUserIds: z.array(guid).min(1).max(10)` — 1〜10 名必須
- Service 層で `validateAssigneesInTenant` が各 userId を同テナントの user_tenant_roles で確認、無ければ `InvalidAssigneeReferenceError`
- Repository の `setAssigneesForTask` は差分更新 (全削除 → 新規 INSERT)

## UI

`TaskForm` の assignee フィールドはチップ式マルチセレクト (「自分」+ 他教員)。複製モードでは初期値を空にして明示選択を強制。担当者候補は `GET /api/tasks/assignees` (テナント内教員) で取得。

## 権限 (RLS)

タスクの UPDATE/DELETE は `assignee or created_by or school_admin` が migration の SQL で物理保証される。詳細は [foundation/rls-and-tenancy.md](../../foundation/rls-and-tenancy.md)。
