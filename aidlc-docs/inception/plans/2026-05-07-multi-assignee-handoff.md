# 5/7 説明会向け 複数アサイン本実装 — 引き継ぎノート

> **作成日**: 2026-05-03
> **背景**: chimo の気づき → 機能C「タスク複製」は妥協案、複数アサインじゃないと運用上意味ない。post-MVP backlog から繰り上げて 5/7 までに本実装。
> **対象ブランチ**: `feat/2026-05-07-multi-assignee` (main から分岐、ベースライン tag `pre-multi-assignee-baseline`)

## 確定設計 (chimo 確認済)

| 項目 | 決定 |
|---|---|
| 進捗管理 | **共通 status** (1 つを全員で共有、個別管理しない) |
| スコープ | 5/3 着手 → 5/5 完了 → 5/6 本番デプロイ |
| `tasks.owner_user_id` | **廃止** → `task_assignees` に一本化 |
| 複製機能 (`POST /api/tasks/:id/duplicate`) | **維持** (個別進捗が必要なケース用) |
| `tasks.created_by` | **維持** (依頼中判定用) |

## 現状 (引き継ぎ時点)

### 完了済み
- 中間 commit `be561a3` を main + 本番反映済 (UI polish + status 5 段階拡張)
- 本番 DB に migration 0025 適用済 (`status` enum に 'backlog' / 'review' 追加)
- ベースライン tag `pre-multi-assignee-baseline` を main HEAD に付与
- 新ブランチ `feat/2026-05-07-multi-assignee` 作成
- **migrations/0026_task_assignees.sql ファイル作成済** (未 commit、ローカル DB 未適用)

### 引き継ぎ時点の DB migration 状態 (2026-05-03 確認)
- 本番 DB: **0025 まで適用済**、Lambda 内 pending 0 件 (`aws lambda invoke db-migrator status` で確認済)
- ローカル DB: **0025 まで適用済**
- 0026 はファイル作成済だが、本番 / ローカルどちらにも未適用 (ファイルが Lambda 内にもまだない、cdk deploy していないため)

### 未着手 (MA-1 から)
- ローカル DB に migration 0026 適用 + 動作確認
- schema.ts / repository / service / API / UI の改修
- テスト + ローカル動作確認
- main マージ + 本番デプロイ

## 既存パターン (重要、推測しない)

### tasks RLS ポリシー名 (実在を grep で確認済)
- `tasks_tenant_read` (migration 0015、FOR SELECT、owner_user_id 参照なし → **維持**)
- `tasks_tenant_insert` (migration 0020、FOR INSERT、参照なし → **維持**)
- `tasks_owner_update` (migration 0020、FOR UPDATE、owner_user_id 参照あり → **DROP**)
- `tasks_owner_delete` (migration 0020、FOR DELETE、owner_user_id 参照あり → **DROP**)

### owner_user_id を参照する index
- `tasks_owner_created_idx` (migration 0014) → **DROP**

### RLS DSL (`src/db/rls/policies.ts`)
- tasks は **DSL に未登録** (既存パターン: tasks 系の RLS は migration 手書きが正本)
- task_assignees も DSL に登録不要 (一貫性維持)

## 各 MA タスクの詳細

### MA-1: migration 0026 適用 + commit
- ブランチ: `feat/2026-05-07-multi-assignee`
- ファイル: `migrations/0026_task_assignees.sql` (作成済)
- 実行:
  ```sh
  pnpm db:local:migrate
  # → 「新規適用 1 件 / スキップ N 件」を確認
  ```
- 確認:
  ```sh
  docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev -c "\d task_assignees"
  docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev -c "\d tasks"  # owner_user_id が無いこと
  docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev -c "SELECT COUNT(*) FROM task_assignees"  # 既存タスク数と一致すること (データ移行確認)
  ```

### MA-2: schema.ts (taskAssignees + tasks から ownerUserId 削除)
- ファイル: `src/db/schema.ts`
- 追加: `taskAssignees` pgTable + 型 export (`TaskAssignee` / `NewTaskAssignee`)
- 削除: `tasks` テーブル定義から `ownerUserId` を削除
- 既存 import の確認: 各所で `tasks.ownerUserId` を参照してる箇所が型エラーになるはずなので、それを MA-4 / MA-5 / MA-6 で順次修正

### MA-3: ローカル DB 適用済の確認
- MA-1 で実施済み

### MA-4: taskRepository 改修
- ファイル: `src/features/tasks/lib/taskRepository.ts`
- 追加メソッド (taskTags パターン踏襲):
  - `findAssigneesByTaskIds(tx, taskIds, ctx)`: 各タスクの assignee user 情報を別クエリで取得 (drizzle GROUP BY 罠回避)
  - `setAssigneesForTask(tx, taskId, userIds, ctx)`: 差分更新 (DELETE + INSERT)
- 改修:
  - `TaskWithOwner` 型: `ownerUserId / ownerName / ownerNickname` → `assignees: { userId, name, nickname }[]` に
  - `findAllByTenant`: tasks 取得後に `findAssigneesByTaskIds` で merge
  - `create` / `update`: `ownerUserId` パラメータ削除、別途 `setAssigneesForTask` で M:N 設定

### MA-5: taskService 改修
- ファイル: `src/features/tasks/lib/taskService.ts`
- `CreateTaskServiceInput` / `UpdateTaskServiceInput` に `assigneeUserIds: string[]` 追加 (ownerUserId 削除)
- `createTask`: `taskRepo.create(tx, params, ctx)` → returning task → `setAssigneesForTask`
- `updateTask`: 同様
- `duplicateTask`: 元タスクの assignees をコピー、複製モーダルで指定された assigneeUserIds で上書き (chimo は元 task の assignees を継承する想定だが、複製モーダルで明示選択させる流れも残す)
- `listTasks`: filters の解釈変更
  - `scope='mine'`: self が assignees に含まれる OR createdBy=self
  - `ownerUserId=X`: X が assignees に含まれるタスク
- `setTaskAssignees(taskId, userIds, ctx)`: 個別 API 用 (assignee 検証 + setAssigneesForTask)

### MA-6: API ハンドラ改修
- `pages/api/tasks/index.ts` (POST):
  - body に `assigneeUserIds: string[]` (1 件以上必須)、`ownerUserId` 削除
  - Zod schema (`createTaskSchema` in `schemas/task.ts`) も同様に変更
- `pages/api/tasks/[id].ts` (PATCH):
  - body に `assigneeUserIds?: string[]` (optional、差分更新)
- `pages/api/tasks/[id]/duplicate.ts`:
  - body の `ownerUserId` → `assigneeUserIds: string[]` に変更
  - `taskService.duplicateTask` で元 assignees を継承するか、body の値で置き換えるか実装
- 関連 Zod (`createTaskSchema` / `updateTaskSchema` / `duplicateTaskSchema`) を更新

### MA-7: TaskCard 改修
- ファイル: `src/features/tasks/components/TaskCard.tsx`
- 既存: `task.ownerName ?? task.ownerNickname` で 1 名表示、`delegated` 判定は `createdBy === selfUserId && ownerUserId !== selfUserId`
- 新仕様:
  - `task.assignees[]` を反映: 3 名以下は全員、4 名以上は「田中, 佐藤 +1」形式
  - `delegated`: `createdBy === selfUserId && !assignees.some(a => a.userId === selfUserId)`
- TaskMatrix の判定 (`isMine = ownerUserId === selfUserId`) も `assignees.some(a => a.userId === selfUserId)` に変更

### MA-8: TaskForm 改修
- ファイル: `src/features/tasks/components/TaskForm.tsx`
- 既存: `ownerUserId` (single string) を `<select>` で選択
- 新仕様:
  - `tagIds` と同じく chip group multi-select で複数 user 選択
  - 「自分」chip + 他教員 chip
  - 1 件以上必須 (空は不可)、複製 mode のときは初期値空 (chimo の現行仕様に倣う)
- `TaskFormValues.ownerUserId: string` → `assigneeUserIds: string[]` に置換
- `toFormInitial(task)` も assignees 反映

### MA-9: TaskBulkCreateForm 改修
- ファイル: `src/features/tasks/components/TaskBulkCreateForm.tsx`
- 既存: 各行の担当者は `<select>` (single)
- 新仕様: 各行で multi-select (compact UI が必要)
- 案 A: dropdown + checkbox 一覧 (open/close state、各行で別々)
- 案 B: chip 一覧を行内に表示 (場所を取る)
- A の方が table の行を圧縮できる、推奨

### MA-10: TaskBoard 改修
- ファイル: `src/features/tasks/components/TaskBoard.tsx`
- `handleCreate` / `handleDuplicate` / `handleBulkCreate`: ownerUserId → assigneeUserIds (配列) を渡す
- 「依頼中タスクも表示」のロジック: `createdBy === selfUserId && !assignees.some(a => a.userId === selfUserId)` で除外
- カテゴリ並び順 (今週やる) のカウント: `assignees.some(a => a.userId === selfUserId) && status === 'todo'` でカウント
- delegated 判定 (前述)

### MA-11: テスト + ローカル動作確認
- 既存 `__tests__/unit/taskService.duplicate.test.ts` を assignees 構造に更新
- ローカルで:
  - 1 タスクに複数 assignee で作成
  - 各 assignee 視点で `/dashboard` のタスクボードに表示されること
  - 進捗 (status) 変更が assignee 全員で同期されること
  - DnD で status 変更
  - 「依頼中」を切り替えて挙動確認
- pnpm type-check / lint / test 全 GREEN
- 1 commit にまとめて main マージ + push → 本番デプロイ (cdk deploy + lambda invoke)

## 注意点 (memory にも記録済)

- **`/api/test/_seed` reset は破壊的**: 全テーブル TRUNCATE。確認なしに叩かない
- **既存 RLS ポリシー名・index 名は推測しない**: grep で実在を確認してから DROP/CREATE
- **drizzle の sub-query で outer 列参照は罠**: GROUP BY 集計は LEFT JOIN + GROUP BY パターン推奨
- **本番デプロイ手順**: cdk deploy で db-migrator Lambda を更新 → aws lambda invoke で migrate
- **複製機能の互換性**: assignee 廃止しないこと、duplicate API も assignees 配列対応に

## 既存 commit ライン (引き継ぎ時点)

```
be561a3 (main HEAD) refactor(tasks): TaskBoard / Form 一連の UI polish + status 5 段階拡張
29aa577 Merge feat/2026-05-07-task-tag-board
df7653d feat(tasks): タグ機能 + カテゴリ刷新 + 一括追加 + 2 軸 Kanban + DnD で TaskBoard を刷新
4b63571 feat(feedback): フィードバック後半 (system_admin 投稿一覧 + トピック CRUD)
a9bdd4e feat(feedback): フィードバック前半 (schema + RLS + 教員 API + FAB UI)
042460e feat(invitations): 一括招待 + system_admin 招待管理画面
4b79f6c feat(tasks): タスク複製機能を追加 (5/7 説明会 機能 C)
```

## 次セッション開始時のチェックリスト

```sh
# 1. ブランチ確認
git status
# → On branch feat/2026-05-07-multi-assignee
# → 未 commit: migrations/0026_task_assignees.sql のみ

# 2. ローカル DB 状態確認 (migration 0025 まで適用済、0026 未適用)
docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev -c "SELECT filename FROM _migrations ORDER BY id"
# → 最後の行が 0025_task_status_5_stages.sql

# 3. 本番状態確認 (migration 0025 まで適用済)
aws lambda invoke --function-name vitanota-prod-db-migrator \
  --payload '{"command":"status"}' --cli-binary-format raw-in-base64-out \
  --region ap-northeast-1 /tmp/status.json
cat /tmp/status.json
```

## 参照
- 要件: 機能C 実装時の議論 (audit.md 2026-05-02 セッション)
- post-MVP backlog: タスク複数アサイン本実装 (M:N) 項目 (今回 5/7 前倒し)
- memory: `feedback_no_speculative_text` / `feedback_implementation_reversibility` / `feedback_test_seed_reset_destructive`
