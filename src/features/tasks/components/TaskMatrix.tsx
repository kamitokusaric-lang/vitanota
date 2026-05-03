// タスクマトリクス: カテゴリ (or タグ) ごとに 5 列 Kanban を縦に積むレイアウト
// 横軸: ステータス (未着手 / 今週やる / 進行中 / 確認・調整中 / 完了) — 5 列固定
// 縦: 行 (カテゴリ別が基本、タグ絞込時は 1 行に集約)
// 1 タスクが複数の行に紐づく (タグ別表示時) ケースは assignTaskToRows が複数 id を返す。
// 各セル (row × status) にそのタスクが TaskCard として並ぶ。
// 横方向 (異なる status 列への) ドラッグ&ドロップで status 変更可能。
import { useMemo, useState } from 'react';
import { TaskCard } from './TaskCard';
import type { TaskWithOwner } from '../hooks/useTasks';

type StatusId = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';

const STATUS_COLS: { id: StatusId; label: string }[] = [
  { id: 'backlog', label: '未着手' },
  { id: 'todo', label: '今週やる' },
  { id: 'in_progress', label: '進行中' },
  { id: 'review', label: '確認・調整中' },
  { id: 'done', label: '完了' },
];

export interface MatrixGroup {
  id: string;
  label: string;
}

interface TaskMatrixProps {
  tasks: TaskWithOwner[];
  rows: MatrixGroup[];
  assignTaskToRows: (task: TaskWithOwner) => string[];
  selfUserId: string;
  onEdit: (task: TaskWithOwner) => void;
  onTaskDropStatus?: (taskId: string, newStatus: StatusId) => void;
}

export function TaskMatrix({
  tasks,
  rows,
  assignTaskToRows,
  selfUserId,
  onEdit,
  onTaskDropStatus,
}: TaskMatrixProps) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [hoverCell, setHoverCell] = useState<{ rowId: string; statusId: StatusId } | null>(null);
  const dndEnabled = !!onTaskDropStatus;

  // grid[rowId][statusId] = tasks[]
  const grid = useMemo(() => {
    const m = new Map<string, Map<StatusId, TaskWithOwner[]>>();
    for (const r of rows) {
      m.set(
        r.id,
        new Map(STATUS_COLS.map((c) => [c.id, [] as TaskWithOwner[]])),
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

  if (rows.length === 0) {
    return (
      <div className="rounded-vn border border-dashed border-vn-border bg-white py-12 text-center text-sm text-gray-500">
        タスクがありません
      </div>
    );
  }

  return (
    <div data-testid="task-matrix">
      {/* status ヘッダ (sticky で常に見える) */}
      <div
        className="sticky top-0 z-10 mb-2 grid grid-cols-5 gap-2 bg-vn-bg/95 py-2 backdrop-blur"
      >
        {STATUS_COLS.map((c) => (
          <div
            key={c.id}
            className="px-2 text-sm font-semibold text-gray-700"
            data-testid={`matrix-col-${c.id}`}
          >
            {c.label}
          </div>
        ))}
      </div>

      {/* 各 row (カテゴリ or タグ) を独立 Kanban として縦に積む */}
      <div className="space-y-4">
        {rows.map((row) => (
          <section key={row.id} data-testid={`matrix-row-${row.id}`}>
            <h3 className="mb-2 border-b border-vn-border pb-1 text-base font-semibold text-gray-800">
              {row.label}
              <span className="ml-2 text-xs font-normal text-gray-400">
                ({rowCounts.get(row.id) ?? 0})
              </span>
            </h3>
            <div className="grid grid-cols-5 gap-2">
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
                      'min-h-[60px] rounded-vn border bg-vn-bg p-2 transition-colors',
                      isDropTarget
                        ? 'border-vn-accent bg-orange-50/60'
                        : 'border-vn-border',
                    ].join(' ')}
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
                    {cellTasks.length === 0 ? (
                      <div className="py-3 text-center text-xs text-gray-300">—</div>
                    ) : (
                      <div className="space-y-2">
                        {cellTasks.map((t) => {
                          const isMine = t.ownerUserId === selfUserId;
                          const delegated = !isMine && t.createdBy === selfUserId;
                          return (
                            <TaskCard
                              key={`${t.id}-${row.id}`}
                              task={t}
                              onEdit={onEdit}
                              delegated={delegated}
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
