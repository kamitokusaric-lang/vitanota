// スマホ縦リスト用の 1 日セクション。 1 日 = 1 section、 月 view では 35-42 個を縦に並べる。
// 通常の TaskCard を流用 (スマホは横幅があるので情報量を落とさず表示)。
// タスクカードクリックで親に onEditTask 発火、 日付ヘッダ / 「+N 件」 で onSelectDate 発火 (詳細モーダル動線)。
import { Plus } from 'lucide-react';
import type { TaskWithAssignees } from '@/features/tasks/hooks/useTasks';
import { TaskCard } from '@/features/tasks/components/TaskCard';

interface CalendarMobileDaySectionProps {
  date: string;
  tasks: TaskWithAssignees[];
  isToday?: boolean;
  outOfMonth?: boolean;
  isCurrentWeek?: boolean;
  maxVisible?: number;
  onSelectDate?: (date: string) => void;
  onEditTask?: (task: TaskWithAssignees) => void;
  onAddTask?: (date: string) => void;
}

const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

function formatDateLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${m}/${d} (${WEEK_LABELS[date.getDay()]})`;
}

export function CalendarMobileDaySection({
  date,
  tasks,
  isToday = false,
  outOfMonth = false,
  isCurrentWeek = false,
  maxVisible = 4,
  onSelectDate,
  onEditTask,
  onAddTask,
}: CalendarMobileDaySectionProps) {
  const visible = tasks.slice(0, maxVisible);
  const overflow = Math.max(0, tasks.length - maxVisible);

  const handleSelect = onSelectDate ? () => onSelectDate(date) : undefined;
  const handleEdit = (task: TaskWithAssignees) => {
    if (onEditTask) onEditTask(task);
  };

  return (
    <section
      data-testid={`calendar-mobile-day-${date}`}
      className={[
        'rounded-xl border border-slate-200/85 p-3',
        isToday
          ? 'bg-vn-accent-bg'
          : outOfMonth
            ? 'bg-slate-50/50'
            : isCurrentWeek
              ? 'bg-amber-50/70'
              : 'bg-white',
      ].join(' ')}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleSelect}
          disabled={!handleSelect}
          data-testid={`calendar-mobile-day-header-${date}`}
          className={[
            'block text-left text-[13px] font-bold',
            handleSelect ? 'cursor-pointer hover:underline' : 'cursor-default',
            outOfMonth
              ? 'text-slate-300'
              : isToday
                ? 'text-vn-accent'
                : 'text-slate-700',
          ].join(' ')}
        >
          {formatDateLabel(date)}
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
            className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <Plus size={16} strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
      {tasks.length === 0 ? (
        <p className="text-[11px] text-slate-400">なし</p>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={handleEdit}
            />
          ))}
          {overflow > 0 && (
            <button
              type="button"
              onClick={handleSelect}
              disabled={!handleSelect}
              data-testid={`calendar-mobile-overflow-${date}`}
              className="self-start px-1.5 py-1 text-[11px] text-slate-500 hover:underline"
            >
              +{overflow} 件
            </button>
          )}
        </div>
      )}
    </section>
  );
}
