# tasks — カテゴリ・タグ・フィルタ

> 親: [overview.md](./overview.md)。API は [api.md](./api.md)。実装: `src/features/tasks/lib/taskCategoryRepository.ts`, `schemas/taskTag.ts`, `src/schemas/userFilterPreferences.ts`。

## カテゴリ (task_categories)

| 項目 | 仕様 |
|---|---|
| name | 最大 50 文字。`(tenant_id, name)` unique |
| is_system_default | true = システム既定 9 個、false = テナント拡張 |
| sort_order | 表示順 (昇順)。system default が先 |

システムデフォルト 9 個 (sort_order 順): 教務 / 生徒指導 / 進路指導 / 学級運営 / 特別活動 / 保健安全指導 / 学校運営 / 渉外 / 雑務。

経緯: 旧コードのハードコード list を DB マスタ化 (migration 0024)。新規テナント作成時に `seedSystemDefaults()` で冪等 INSERT ((tenant_id, name) unique なので再実行 safe)。

> 注: system_default 体系は徐々にカスタムへ移管 → 全廃する方針。TaskBoard.tsx のカテゴリ filter は暫定で、撤去条件は DB 上の system_default 全削除。

## タグ (task_tags)

| 項目 | 仕様 |
|---|---|
| name | 最大 100 文字。`(tenant_id, name)` unique |
| 作成権限 | teacher 以上 (全教員がテナント共有タグを作れる) |
| 同名作成 | 409 Conflict |
| 一覧 | 利用件数 (assignmentCount) 付き |
| 削除 | 未使用 (count=0) のみ可。利用中は 409 (TAG_IN_USE) |

中間テーブル `task_tag_assignments` (PK `(task_id, tag_id, tenant_id)`)。tag_id → task_tags は ON DELETE RESTRICT (使用中タグの削除を防ぐ)。タグ集合の置換は `PUT /api/tasks/{id}/tags`。

## フィルタ設定 (filter-preferences)

ユーザーごとにボードのフィルタ状態を保存する (`context='tasks'`)。

```ts
type TaskFilterSettings = {
  filterOwner: string | null;     // 担当者 (null=全員)
  filterTagIds: string[];          // タグ AND 絞込
  filterCategoryIds: string[];     // カテゴリ AND 絞込
  showDelegated: boolean;          // 依頼中も表示
  period: { mode: 'default' } | { mode: 'range'; from: string; to: string };
};
```

- 取得: `GET /api/users/me/filter-preferences/tasks` (未保存なら null)
- 保存: `PUT /api/users/me/filter-preferences/tasks` (userId × tenantId × context で UPSERT)
- RLS: 本人のみ書込可

## TaskBoard (カンバン表示)

- 横軸: status 5 段階。ドラッグ&ドロップで status 変更
- フィルタ反映: filterOwner は API 呼出 (scope='mine' or ownerUserId=X)、tag/category は client-side で `array.filter`、showDelegated=false なら依頼中を非表示
- 期間: default (今週/期限なし/期限切れ) または range (from/to)

フィルタ部品: `AssigneeFilter` / `CategoryFilter` / `TagFilter` / `PeriodFilter` (`components/`)。

## 主な実装ファイル

- `lib/taskCategoryRepository.ts`
- `schemas/taskTag.ts` / `src/schemas/userFilterPreferences.ts`
- `components/TaskBoard.tsx` と各 Filter コンポーネント
- `hooks/useTaskCategories.ts` / `useTaskTags.ts` / `useTaskFilterPreferences.ts`
