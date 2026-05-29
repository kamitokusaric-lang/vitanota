// PC 月 grid の 1 日セル。 compact タスク行を最大 N 件 + 「+N 件」。
// タスク行クリックで親に onEditTask、 日付ヘッダ / 「+N 件」 で onSelectDate (詳細モーダル動線)。
// PC では compact 行を draggable、 セルを drop target に → 日付セルへ drop で onMoveTask。
import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { TaskWithAssignees } from '@/features/tasks/hooks/useTasks';

interface CalendarMonthCellProps {
  date: string; // YYYY-MM-DD
  tasks: TaskWithAssignees[];
  isToday?: boolean;
  outOfMonth?: boolean;
  maxVisible?: number;
  onSelectDate?: (date: string) => void;
  onEditTask?: (task: TaskWithAssignees) => void;
  onMoveTask?: (taskId: string, newDate: string) => void;
  onAddTask?: (date: string) => void;
}

function dueDateToYmd(value: string | Date | null): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function todayYmdStr(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function MonthCompactTaskRow({
  task,
  onEdit,
  draggable,
}: {
  task: TaskWithAssignees;
  onEdit?: (task: TaskWithAssignees) => void;
  draggable?: boolean;
}) {
  const dueYmd = dueDateToYmd(task.dueDate);
  const today = todayYmdStr();
  const isDone = task.status === 'done';
  const overdueActive = !!dueYmd && !isDone && dueYmd < today;
  const dueToday = !!dueYmd && dueYmd === today;
  const dotClass = overdueActive
    ? 'bg-red-600'
    : dueToday
      ? 'bg-vn-accent'
      : '';
  return (
    <button
      type="button"
      onClick={onEdit ? () => onEdit(task) : undefined}
      disabled={!onEdit}
      draggable={draggable}
      onDragStart={
        draggable
          ? (e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/task-id', task.id);
            }
          : undefined
      }
      data-testid={`calendar-month-task-row-${task.id}`}
      className={[
        'flex w-full items-center gap-1 rounded-md px-1 py-0.5 text-left text-[11px] leading-snug transition',
        onEdit ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default',
        draggable ? 'active:cursor-grabbing' : '',
        isDone
          ? 'text-slate-400 line-through opacity-60'
          : overdueActive
            ? 'text-red-700'
            : 'text-slate-700',
      ].join(' ')}
    >
      {dotClass && (
        <span
          aria-hidden
          className={`inline-block h-1 w-1 shrink-0 rounded-full ${dotClass}`}
        />
      )}
      <span className="truncate">{task.title}</span>
    </button>
  );
}

export function CalendarMonthCell({
  date,
  tasks,
  isToday = false,
  outOfMonth = false,
  maxVisible = 3,
  onSelectDate,
  onEditTask,
  onMoveTask,
  onAddTask,
}: CalendarMonthCellProps) {
  const dayNum = Number(date.slice(8, 10));
  const visible = tasks.slice(0, maxVisible);
  const overflow = Math.max(0, tasks.length - maxVisible);
  const handleSelect = onSelectDate ? () => onSelectDate(date) : undefined;
  const [isDropOver, setIsDropOver] = useState(false);

  const dropHandlers = onMoveTask
    ? {
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setIsDropOver(true);
        },
        onDragLeave: () => setIsDropOver(false),
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          setIsDropOver(false);
          const taskId = e.dataTransfer.getData('text/task-id');
          if (taskId) onMoveTask(taskId, date);
        },
      }
    : {};

  return (
    <div
      {...dropHandlers}
      data-testid={`calendar-month-cell-${date}`}
      className={[
        'flex min-h-[96px] flex-col gap-1 rounded-lg border p-1.5 transition',
        isDropOver
          ? 'border-vn-accent bg-indigo-50/50'
          : 'border-slate-200/85',
        !isDropOver &&
          (isToday ? 'bg-indigo-50/30' : outOfMonth ? 'bg-slate-50/50' : 'bg-white'),
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={handleSelect}
          disabled={!handleSelect}
          data-testid={`calendar-month-cell-header-${date}`}
          className={[
            'block text-left text-[12px] font-semibold leading-none',
            handleSelect ? 'cursor-pointer hover:underline' : 'cursor-default',
            outOfMonth
              ? 'text-slate-300'
              : isToday
                ? 'text-vn-accent'
                : 'text-slate-700',
          ].join(' ')}
        >
          {dayNum}
        </button>
        {onAddTask && !outOfMonth && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddTask(date);
            }}
            data-testid={`calendar-add-task-${date}`}
            aria-label="タスクを追加"
            className="rounded p-0.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <Plus size={14} strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        {visible.map((task) => (
          <MonthCompactTaskRow
            key={task.id}
            task={task}
            onEdit={onEditTask}
            draggable={!!onMoveTask && task.status !== 'done'}
          />
        ))}
        {overflow > 0 && (
          <button
            type="button"
            onClick={handleSelect}
            disabled={!handleSelect}
            data-testid={`calendar-month-cell-overflow-${date}`}
            className="self-start px-1 py-0.5 text-[10px] text-slate-500 hover:underline"
          >
            +{overflow} 件
          </button>
        )}
      </div>
    </div>
  );
}
