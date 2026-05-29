// PC 7 列 grid の 1 日セル。 タスクをコンパクトに最大 4 件 + 「+N 件」。
// 編集モーダル integrate は Phase 3 で対応するため、 行クリックは現状 noop。
import type { TaskWithAssignees } from '@/features/tasks/hooks/useTasks';

interface CalendarDayCellProps {
  date: string; // YYYY-MM-DD
  tasks: TaskWithAssignees[];
  isToday?: boolean;
}

const MAX_VISIBLE = 4;
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

function CalendarTaskRow({ task }: { task: TaskWithAssignees }) {
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
    <div
      data-testid={`calendar-task-row-${task.id}`}
      className={[
        'flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] leading-snug',
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
    </div>
  );
}

export function CalendarDayCell({
  date,
  tasks,
  isToday = false,
}: CalendarDayCellProps) {
  const visible = tasks.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, tasks.length - MAX_VISIBLE);

  return (
    <div
      data-testid={`calendar-day-${date}`}
      className={[
        'flex min-h-[140px] flex-col gap-1.5 rounded-xl border border-slate-200/85 p-2',
        isToday ? 'bg-indigo-50/30' : 'bg-white',
      ].join(' ')}
    >
      <div
        className={[
          'text-[11px] font-semibold',
          isToday ? 'text-vn-accent' : 'text-slate-600',
        ].join(' ')}
      >
        {formatDateLabel(date)}
      </div>
      <div className="flex flex-col gap-1">
        {visible.map((task) => (
          <CalendarTaskRow key={task.id} task={task} />
        ))}
        {overflow > 0 && (
          <div
            data-testid={`calendar-day-overflow-${date}`}
            className="px-1.5 py-1 text-[11px] text-slate-500"
          >
            +{overflow} 件
          </div>
        )}
      </div>
    </div>
  );
}
