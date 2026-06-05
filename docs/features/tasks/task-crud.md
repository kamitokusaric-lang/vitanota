# tasks — CRUD・複製・コメント

> 親: [overview.md](./overview.md)。複数アサインは [multi-assignee.md](./multi-assignee.md)、API は [api.md](./api.md)。実装: `src/features/tasks/lib/`。

## ドメインエンティティ

### Task
| フィールド | 型 | 説明 |
|---|---|---|
| `title` | varchar(200) | タイトル (UI は 1〜15 文字、API は 200 まで) |
| `description` | text | 説明 (最大 2000 文字) |
| `due_date` | DATE | 期限。timezone free、API は 'YYYY-MM-DD' で往復。null 可 |
| `status` | enum | backlog / todo / in_progress / review / done |
| `completed_at` | timestamptz | status=done で自動設定 |
| `category_id` | UUID | 複合 FK `(id, tenant_id)` でクロステナント参照防止 |
| `created_by` | UUID | 作成者 (委譲判定に使う) |
| `source_chat_snippet` | text | AI チャット由来タスクの context (任意) |

API 応答型 `TaskWithAssignees` は Task に `assignees[]` (userId/name/nickname)、`commentCount`、`tags[]` を足したもの。

### TaskComment
本文 1〜2000 文字。投稿者は session から自動注入。

## CRUD の挙動

### 作成 (`POST /api/tasks`)
- 入力: categoryId, assigneeUserIds[] (1〜10 名必須), title, description?, dueDate?
- assigneeUserIds が同テナントの user_tenant_roles に存在するか検証 (違反は `InvalidAssigneeReferenceError`)
- created_by=self, status=todo, completed_at=null で生成

### 編集 (`PATCH /api/tasks/{id}`)
- 部分更新 (categoryId? / title? / description? / dueDate? / status? / assigneeUserIds? すべて任意)
- 権限: assignee or createdBy or school_admin (RLS で担保)
- assigneeUserIds 指定時は「全削除 → 新規 INSERT」で置換

### 削除 (`DELETE /api/tasks/{id}`)
- 権限は編集と同じ。コメント・タグ割当は CASCADE で自動削除

### 複製 (`POST /api/tasks/{id}/duplicate`)
- title / description / dueDate / categoryId は複製元から継承 (編集で上書き可)
- assigneeUserIds は**空から選択強制** (誰に振るかを明示させる)
- status は常に todo、completed_at=null、コメントは引き継がない、created_by=複製操作者

## コメント

| 操作 | エンドポイント | 備考 |
|---|---|---|
| 一覧 | `GET /api/tasks/{id}/comments` | created_at ASC (古い順) |
| 追加 | `POST /api/tasks/{id}/comments` | body 1〜2000 文字 |
| 削除 | `DELETE /api/tasks/{id}/comments/{commentId}` | 投稿者本人のみ (RLS WITH CHECK) |

## 期間フィルタロジック

`periodCalc.ts` が週/月を計算する。mode は 2 つ:

**mode='default'** (今やるべき 3 点セット):
```
未完了: (due_date が今週内) OR (due_date IS NULL) OR (due_date < weekStart AND status≠done = 期限切れ)
完了:   status=done AND completed_at::date が今週内
```

**mode='range'** (純粋な範囲指定):
```
未完了: due_date が [from, to]
完了:   completed_at::date が [from, to]
```

## Form コンポーネントの役割分担

| 用途 | コンポーネント |
|---|---|
| 新規作成 (タブ式 UI) | `TaskCreateTabs` → 内部で `TaskForm` (mode='create') |
| 編集 | `TaskForm` (mode='edit'、全値プリフィル) |
| 複製 | `TaskForm` (mode='duplicate'、assignee は空から選択) |

`ManualTaskCreateForm` は移行中、`TaskBulkCreateForm` は廃止済み。

## 主な実装ファイル

- `lib/taskService.ts` / `lib/taskRepository.ts`
- `lib/taskCommentService.ts` / `lib/taskCommentRepository.ts`
- `lib/periodCalc.ts`
- `components/TaskForm.tsx` / `TaskBoard.tsx` / `TaskCard.tsx` / `TaskCommentSection.tsx`
- `hooks/useTasks.ts` / `useTaskComments.ts`
- `schemas/task.ts` / `schemas/taskComment.ts`
