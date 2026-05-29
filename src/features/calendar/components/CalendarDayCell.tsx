// PC 7 列 grid の 1 日セル (週 view)。 タスクをコンパクトに最大 N 件 + 「+N 件」。
// タスク行クリックで親に onEditTask、 日付ヘッダ / 「+N 件」 で onSelectDate。
// PC では compact 行を draggable、 セルを drop target に → 日付セルへ drop で onMoveTask。
import { useState } from 'react';
import type { TaskWithAssignees } from '@/features/tasks/hooks/useTasks';

interface CalendarDayCellProps {
  date: string; // YYYY-MM-DD
  tasks: TaskWithAssignees[];
  isToday?: boolean;
  outOfMonth?: boolean;
  maxVisible?: number;
  onSelectDate?: (date: string) => void;
  onEditTask?: (task: TaskWithAssignees) => void;
  onMoveTask?: (taskId: string, newDate: string) => void;
}

const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

function formatDateLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${m}/${d} (${WEEK_LABELS[date.getDay()]})`;
}

function dueDateToYmd(value: string | Date | null): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function todayYmd(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function CalendarTaskRow({
  task,
  onEdit,
  draggable,
}: {
  task: TaskWithAssignees;
  onEdit?: (task: TaskWithAssignees) => void;
  draggable?: boolean;
}) {
  const dueYmd = dueDateToYmd(task.dueDate);
  const today = todayYmd();
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
      data-testid={`calendar-task-row-${task.id}`}
      className={[
        'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12px] leading-snug transition',
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
          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`}
        />
      )}
      <span className="truncate">{task.title}</span>
    </button>
  );
}

export function CalendarDayCell({
  date,
  tasks,
  isToday = false,
  outOfMonth = false,
  maxVisible = 4,
  onSelectDate,
  onEditTask,
  onMoveTask,
}: CalendarDayCellProps) {
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
      data-testid={`calendar-day-${date}`}
      className={[
        'flex min-h-[140px] flex-col gap-1.5 rounded-xl border p-2 transition',
        isDropOver
          ? 'border-vn-accent bg-indigo-50/50'
          : 'border-slate-200/85',
        !isDropOver && (isToday ? 'bg-indigo-50/30' : outOfMonth ? 'bg-slate-50/50' : 'bg-white'),
      ].filter(Boolean).join(' ')}
    >
      <button
        type="button"
        onClick={handleSelect}
        disabled={!handleSelect}
        data-testid={`calendar-day-header-${date}`}
        className={[
          'block w-full text-left text-[11px] font-semibold',
          handleSelect ? 'cursor-pointer hover:underline' : 'cursor-default',
          outOfMonth
            ? 'text-slate-300'
            : isToday
              ? 'text-vn-accent'
              : 'text-slate-600',
        ].join(' ')}
      >
        {formatDateLabel(date)}
      </button>
      <div className="flex flex-col gap-1">
        {visible.map((task) => (
          <CalendarTaskRow
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
            data-testid={`calendar-day-overflow-${date}`}
            className="self-start px-1.5 py-1 text-[11px] text-slate-500 hover:underline"
          >
            +{overflow} 件
          </button>
        )}
      </div>
    </div>
  );
}
