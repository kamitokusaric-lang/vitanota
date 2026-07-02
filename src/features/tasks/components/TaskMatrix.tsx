// タスクマトリクス: カテゴリ (or タグ) ごとに 5 列 Kanban を縦に積むレイアウト
// 横軸: ステータス (未着手 / 今日やる / 進行中 / 確認・調整中 / 完了) — 5 列固定
//   chimo 2026-05-20: 'todo' の表示ラベルを「今週やる」 → 「今日やる」 に変更
//   (朝カード H3-B「今日の予定に入れる」 動線と整合させる、 status enum 自体は不変)
// 縦: 行 (カテゴリ別が基本、タグ絞込時は 1 行に集約)
// 1 タスクが複数の行に紐づく (タグ別表示時) ケースは assignTaskToRows が複数 id を返す。
// 各セル (row × status) にそのタスクが TaskCard として並ぶ。
// 横方向 (異なる status 列への) ドラッグ&ドロップで status 変更可能。
import { useMemo, useState } from 'react';
import { TaskCard } from './TaskCard';
import type { TaskWithAssignees } from '../hooks/useTasks';

type StatusId = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';

const STATUS_COLS: { id: StatusId; label: string }[] = [
  { id: 'backlog', label: '未着手' },
  { id: 'todo', label: '今日やる' },
  { id: 'in_progress', label: '進行中' },
  { id: 'review', label: '確認・調整中' },
  { id: 'done', label: '完了' },
];

export interface MatrixGroup {
  id: string;
  label: string;
}

interface TaskMatrixProps {
  tasks: TaskWithAssignees[];
  rows: MatrixGroup[];
  assignTaskToRows: (task: TaskWithAssignees) => string[];
  selfUserId: string;
  onEdit: (task: TaskWithAssignees) => void;
  onTaskDropStatus?: (taskId: string, newStatus: StatusId) => void;
  // true のとき、自分が assignee のタスクを薄い黄色 + カード左の赤ラインで識別 (「全員」フィルタ時に有効化)
  highlightMineTasks?: boolean;
  // 縦軸 grouping 廃止に伴い、 カードにカテゴリ chip を出すための name 解決用 Map
  categoryNameById?: Map<string, string>;
}

export function TaskMatrix({
  tasks,
  rows,
  assignTaskToRows,
  selfUserId,
  onEdit,
  onTaskDropStatus,
  highlightMineTasks = false,
  categoryNameById,
}: TaskMatrixProps) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [hoverCell, setHoverCell] = useState<{ rowId: string; statusId: StatusId } | null>(null);
  const dndEnabled = !!onTaskDropStatus;

  // grid[rowId][statusId] = tasks[]
  const grid = useMemo(() => {
    const m = new Map<string, Map<StatusId, TaskWithAssignees[]>>();
    for (const r of rows) {
      m.set(
        r.id,
        new Map(STATUS_COLS.map((c) => [c.id, [] as TaskWithAssignees[]])),
      );
    }
    for (const t of tasks) {
      for (const rowId of assignTaskToRows(t)) {
        const colMap = m.get(rowId);
        if (!colMap) continue;
        const cell = colMap.get(t.status);
        if (cell) cell.push(t);
      }
    }
    return m;
  }, [tasks, rows, assignTaskToRows]);

  const rowCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.id, 0);
    for (const t of tasks) {
      for (const rowId of assignTaskToRows(t)) {
        counts.set(rowId, (counts.get(rowId) ?? 0) + 1);
      }
    }
    return counts;
  }, [tasks, rows, assignTaskToRows]);

  // 列 (status) ごとの件数 (grid のセル長を全 row 分合算)。sticky ヘッダの「未着手 2」表示用。
  const colCounts = useMemo(() => {
    const counts = new Map<StatusId, number>();
    for (const c of STATUS_COLS) counts.set(c.id, 0);
    for (const r of rows) {
      const colMap = grid.get(r.id);
      if (!colMap) continue;
      for (const c of STATUS_COLS) {
        counts.set(c.id, (counts.get(c.id) ?? 0) + (colMap.get(c.id)?.length ?? 0));
      }
    }
    return counts;
  }, [grid, rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-vn border border-dashed border-vn-border bg-white py-12 text-center text-sm text-gray-500">
        タスクがありません
      </div>
    );
  }

  return (
    <div data-testid="task-matrix">
      {/* status ヘッダ (sticky で常に見える、nav h-[72px] の下にピン)
          2026-07-02: 下線見出し → 淡いグレーの角丸バー (ラベル + 件数)。デザイン刷新。 */}
      <div
        className="sticky top-[72px] z-10 mb-3 hidden grid-cols-5 gap-5 bg-vn-bg/95 py-2 backdrop-blur lg:grid"
      >
        {STATUS_COLS.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-center gap-2 rounded-lg bg-slate-200 px-3 py-2 text-[15px] font-bold leading-[1.4] text-slate-700"
            data-testid={`matrix-col-${c.id}`}
          >
            <span>{c.label}</span>
            <span className="text-[13px] font-semibold text-slate-400">
              {colCounts.get(c.id) ?? 0}
            </span>
          </div>
        ))}
      </div>

      {/* 各 row (カテゴリ or タグ) を独立 Kanban として縦に積む
          chimo 2026-05-20: カテゴリ見出しは 18px / 800 / #0F172A、 件数は 15px / 700 / slate-400
          row.label === '' のときは見出しを出さない (= 縦軸 grouping 廃止モード、 chimo 2026-05-20) */}
      <div className="space-y-10">
        {rows.map((row) => (
          <section key={row.id} data-testid={`matrix-row-${row.id}`}>
            {row.label !== '' && (
              <h3 className="mb-3.5 mt-6 text-[18px] font-extrabold leading-[1.4] text-slate-900">
                {row.label}
                <span className="ml-1 text-[15px] font-bold text-slate-400">
                  ({rowCounts.get(row.id) ?? 0})
                </span>
              </h3>
            )}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-5 lg:gap-5">
              {STATUS_COLS.map((c) => {
                const cellTasks = grid.get(row.id)?.get(c.id) ?? [];
                const isDropTarget =
                  dndEnabled &&
                  draggingTaskId !== null &&
                  hoverCell?.rowId === row.id &&
                  hoverCell?.statusId === c.id;
                return (
                  <div
                    key={c.id}
                    className={[
                      // モバイルは縦積みのプレーンなセクション。 lg 以上で従来のカラム箱。
                      'transition-colors lg:min-h-[260px] lg:rounded-xl lg:p-3',
                      // 空セルはモバイルでは出さない (見出し + 空箱が縦に並ぶのを防ぐ)。
                      // desktop は drag の drop 先として空でも残す (chimo 2026-06-15)。
                      cellTasks.length === 0 ? 'hidden lg:block' : '',
                      // 平常時のレーン地は透明・枠なし (chimo 2026-07-02)。drop 中だけ枠 + 薄い地で drop 先を示す。
                      isDropTarget ? 'lg:border lg:border-vn-accent lg:bg-vn-muted-bg' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    data-testid={`matrix-cell-${row.id}-${c.id}`}
                    onDragOver={
                      dndEnabled
                        ? (e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (
                              hoverCell?.rowId !== row.id ||
                              hoverCell?.statusId !== c.id
                            ) {
                              setHoverCell({ rowId: row.id, statusId: c.id });
                            }
                          }
                        : undefined
                    }
                    onDragLeave={
                      dndEnabled
                        ? () => {
                            if (
                              hoverCell?.rowId === row.id &&
                              hoverCell?.statusId === c.id
                            ) {
                              setHoverCell(null);
                            }
                          }
                        : undefined
                    }
                    onDrop={
                      dndEnabled
                        ? (e) => {
                            e.preventDefault();
                            const taskId = e.dataTransfer.getData('text/task-id');
                            if (taskId) onTaskDropStatus?.(taskId, c.id);
                            setHoverCell(null);
                            setDraggingTaskId(null);
                          }
                        : undefined
                    }
                  >
                    {/* モバイル専用: 縦積み時にどのステータスかを示す見出し
                        (desktop は上部 sticky ヘッダが担うので lg:hidden)。 */}
                    <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-slate-200 px-2.5 py-1.5 text-[13px] font-bold leading-[1.4] text-slate-600 lg:hidden">
                      <span>{c.label}</span>
                      <span className="text-[12px] font-semibold text-slate-400">
                        {cellTasks.length}
                      </span>
                    </div>
                    {cellTasks.length === 0 ? (
                      <div className="py-6"></div>
                    ) : (
                      <div className="space-y-2">
                        {cellTasks.map((t) => {
                          const isMine = t.assignees.some((a) => a.userId === selfUserId);
                          const delegated = !isMine && t.createdBy === selfUserId;
                          return (
                            <TaskCard
                              key={`${t.id}-${row.id}`}
                              task={t}
                              onEdit={onEdit}
                              delegated={delegated}
                              mineHighlight={highlightMineTasks && isMine}
                              categoryName={categoryNameById?.get(t.categoryId)}
                              onDragStart={
                                dndEnabled
                                  ? (taskId) => setDraggingTaskId(taskId)
                                  : undefined
                              }
                              onDragEnd={
                                dndEnabled
                                  ? () => {
                                      setDraggingTaskId(null);
                                      setHoverCell(null);
                                    }
                                  : undefined
                              }
                              // モバイル (lg 未満) のドラッグ代替。 drop と同じハンドラを流用。
                              onChangeStatus={onTaskDropStatus}
                              statusOptions={STATUS_COLS}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
