# calendar (カレンダー表示)

> タスクを月/日で見渡し、仕事の偏りと見通しを掴むビュー。既存タスクをそのまま別 view で見せる薄い機能 (schema 変更ゼロ)。

- **src**: `src/features/calendar/`
- **対応要件**: Unit-06 (カレンダー, 2026-05-29 / H3 見通し仮説)
- **粒度**: overview 1 枚 (薄い機能)
- **OpenAPI**: 専用 API なし (`Task` / `Account` の既存 API を読む)

## 何ができるか

- 月表示グリッド (PC 5-6×7、スマホ縦リスト) と、日付タップで日別タスク詳細モーダル
- タグ・カテゴリ・showDelegated のクライアント側フィルタ + 期間の server 側絞り込み (tasks ボードと共有)
- ドラッグ&ドロップでの日付変更 (実装済み、段階展開)
- 利用計測 (`calendar_*` イベント → [access-distribution](../access-distribution/overview.md))

## 制約 (Phase 0)

- `tasks` テーブル (`due_date` / `status` / `category_id`) を流用、`task_assignees` で scope='mine'。**schema 変更ゼロ**
- 予定 (events) は MVP scope 外 — カレンダーは「予定表」ではなく「タスクの見通しビュー」
- 心理的配慮: 「山場かも」等のやわらかい語彙、警告色の多用禁止 ([PHILOSOPHY §6 設計語彙](../../PHILOSOPHY.md))

## 使う API

| メソッド | パス | 用途 | tag |
|---|---|---|---|
| GET | `/api/tasks` | 期間絞り込みでタスク取得 (dateFilter=range, scope) | Task |
| GET/PUT | `/api/users/me/filter-preferences/tasks` | ボードと共有のフィルタ設定 | Task |

API 契約の正本は [features/tasks/api.md](../tasks/api.md) と OpenAPI registry。

## 実装の所在

`components/CalendarMonthView.tsx`・`CalendarDayDetailModal.tsx`・`hooks/useCalendarTasks.ts`・`lib/calendarDateRange.ts`・`applyClientSideFilters.ts`。tasks の `TaskBoard` とフィルタ・編集モーダルを共有する (`TasksTabWithCalendar.tsx`)。
