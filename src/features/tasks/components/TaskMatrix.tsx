// タスクマトリクス: 行=可変グループ (カテゴリ or タグ) × 列=ステータス (Kanban 的)
// 1 タスクが複数の行に紐づく (タグ別表示時) ケースは assignTaskToRows が複数 id を返す。
// 各セル (row × status) にそのタスクが TaskCard として並ぶ。
// 横方向 (異なる status 列への) ドラッグ&ドロップで status 変更可能。
import { useMemo, useState } from 'react';
import { TaskCard } from './TaskCard';
import type { TaskWithOwner } from '../hooks/useTasks';

type StatusId = 'todo' | 'in_progress' | 'done';

const STATUS_COLS: { id: StatusId; label: string }[] = [
  { id: 'todo', label: '未着手' },
  { id: 'in_progress', label: '進行中' },
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
  // ドロップ時に status を変更したいときのコールバック。指定なら DnD 有効
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
  // ドラッグ中のタスクと、ドラッグオーバー中のセル (status のみ判定に使う)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [hoverStatus, setHoverStatus] = useState<StatusId | null>(null);
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

  // 各行のタスク件数 (重複あり / 全列合計)
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
        行がありません
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full border-separate"
        style={{ borderSpacing: '0.5rem' }}
        data-testid="task-matrix"
      >
        <thead>
          <tr>
            <th className="w-[140px] text-left text-xs uppercase tracking-wider text-gray-500" />
            {STATUS_COLS.map((c) => (
              <th
                key={c.id}
                scope="col"
                className="min-w-[220px] px-2 py-2 text-left text-sm font-semibold text-gray-700"
                data-testid={`matrix-col-${c.id}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th
                scope="row"
                className="w-[140px] align-top px-2 py-2 text-left text-sm font-medium text-gray-700"
                data-testid={`matrix-row-${row.id}`}
              >
                {row.label}
                <span className="ml-1 text-xs font-normal text-gray-400">
                  ({rowCounts.get(row.id) ?? 0})
                </span>
              </th>
              {STATUS_COLS.map((c) => {
                const cellTasks = grid.get(row.id)?.get(c.id) ?? [];
                const isDropTarget =
                  dndEnabled && draggingTaskId !== null && hoverStatus === c.id;
                return (
                  <td
                    key={c.id}
                    className={[
                      'min-w-[220px] align-top rounded-vn border bg-vn-bg p-2 transition-colors',
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
                            if (hoverStatus !== c.id) setHoverStatus(c.id);
                          }
                        : undefined
                    }
                    onDragLeave={
                      dndEnabled
                        ? () => {
                            if (hoverStatus === c.id) setHoverStatus(null);
                          }
                        : undefined
                    }
                    onDrop={
                      dndEnabled
                        ? (e) => {
                            e.preventDefault();
                            const taskId = e.dataTransfer.getData('text/task-id');
                            if (taskId) onTaskDropStatus?.(taskId, c.id);
                            setHoverStatus(null);
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
                                      setHoverStatus(null);
                                    }
                                  : undefined
                              }
                            />
                          );
                        })}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
