# tasks (タスク管理)

> 教員向けタスク管理。複数担当者で進捗を共有し、カテゴリ + タグで分類、期間フィルタ付きボードで見渡す。
> タスクは**業務データ**なので集計・改善ソース化が許される (情緒データと違い観測されても壊れない、[PHILOSOPHY §4.1](../../PHILOSOPHY.md))。

- **src**: `src/features/tasks/`
- **対応要件**: FR (タスク管理)。複数アサイン・複製は 2026-05-07 説明会向け機能で追加
- **粒度**: 分割 (重い機能)
- **OpenAPI**: あり (tag: `Task`)

## 何ができるか

- タスク CRUD: 作成・編集・削除。ステータス 5 段階 (backlog / todo / in_progress / review / done)
- 複数アサイン: 1 タスクに複数教員を同時割当、進捗 (status) は全員で共有
- 委譲 (依頼中): 自分が作ったが自分は担当でないタスクを「依頼中」として表示
- タスク複製: 既存タスクから別担当者向けに複製 (status=todo から、コメントは引き継がない)
- コメント: タスクごとに複数、削除は投稿者本人のみ
- カテゴリ (system_default 9 個 + テナント拡張) とタグ (全教員が作成可) で分類
- フィルタ + 期間指定のカンバンボード表示 (担当者・カテゴリ・タグ・期間)

## 仕様の所在

- [task-crud.md](./task-crud.md) — CRUD・複製・コメント・期間フィルタロジック
- [multi-assignee.md](./multi-assignee.md) — 複数アサイン・委譲 (依頼中) フロー・scope='mine' の定義
- [tags-and-filters.md](./tags-and-filters.md) — カテゴリ・タグ・フィルタ設定・ボード表示
- [api.md](./api.md) — エンドポイント一覧 (契約の正本は OpenAPI registry)

## 横断依存

- データモデル → [foundation/data-model.md](../../foundation/data-model.md#タスク管理-tasks)
- テナント隔離・権限 (assignee/createdBy/school_admin) → [foundation/rls-and-tenancy.md](../../foundation/rls-and-tenancy.md)
- カレンダーは tasks/journal を読んで表示する別ビュー (→ features/calendar 移植予定)
