# tasks — API

> **契約の正本は `src/openapi/registry.ts` (tag: `Task`) と生成物 `openapi.yaml`。**
> 本ファイルはエンドポイントの索引であり、リクエスト/レスポンスのボディ定義をここに複写しない (陳腐化防止)。
> 契約を変えたら registry を更新し `pnpm gen:openapi` → `pnpm openapi:check` / `pnpm openapi:coverage` を緑にする (CLAUDE.md の OpenAPI DoD)。

| メソッド | パス | 用途 | 権限 | tag |
|---|---|---|---|---|
| GET | `/api/tasks` | 一覧取得 (フィルタ・期間指定可) | auth | Task |
| POST | `/api/tasks` | 作成 | auth | Task |
| GET | `/api/tasks/{id}` | 単体取得 | auth | Task |
| PATCH | `/api/tasks/{id}` | 更新 (status/assignees/期限等) | assignee \| createdBy \| school_admin | Task |
| DELETE | `/api/tasks/{id}` | 削除 | 同上 | Task |
| POST | `/api/tasks/{id}/duplicate` | 複製 | auth | Task |
| GET | `/api/tasks/{id}/comments` | コメント一覧 | auth | Task |
| POST | `/api/tasks/{id}/comments` | コメント追加 | auth | Task |
| DELETE | `/api/tasks/{id}/comments/{commentId}` | コメント削除 | 投稿者本人 | Task |
| PUT | `/api/tasks/{id}/tags` | タグ集合を置換 | auth | Task |
| GET | `/api/tasks/assignees` | 担当者候補一覧 (テナント内教員) | auth | Task |
| GET | `/api/task-categories` | カテゴリ一覧 | auth | Task |
| GET | `/api/task-tags` | タグ一覧 (利用件数付) | auth | Task |
| POST | `/api/task-tags` | タグ作成 | teacher+ | Task |
| DELETE | `/api/task-tags/{id}` | タグ削除 (未使用のみ) | auth | Task |
| GET | `/api/users/me/filter-preferences/tasks` | フィルタ設定取得 | auth | Task |
| PUT | `/api/users/me/filter-preferences/tasks` | フィルタ設定保存 (UPSERT) | auth | Task |

クエリ例:
```
GET /api/tasks?scope=mine&mode=default&weekStart=2026-06-02&weekEnd=2026-06-08
GET /api/tasks?ownerUserId=xxx&mode=range&from=2026-06-01&to=2026-06-30
```

挙動の詳細: [task-crud.md](./task-crud.md) (期間ロジック)、[multi-assignee.md](./multi-assignee.md) (scope/委譲)、[tags-and-filters.md](./tags-and-filters.md) (フィルタ設定)。
