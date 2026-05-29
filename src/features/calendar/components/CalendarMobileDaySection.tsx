// スマホ縦リスト用の 1 日セクション。 1 日 = 1 section、 7 つを縦に並べる。
// 通常の TaskCard を流用 (スマホは横幅があるので情報量を落とさず表示)。
// onEdit / categoryName 統合は Phase 3 で対応。
import type { TaskWithAssignees } from '@/features/tasks/hooks/useTasks';
import { TaskCard } from '@/features/tasks/components/TaskCard';

interface CalendarMobileDaySectionProps {
  date: string;
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

function noopEdit() {
  // Phase 3 で TaskBoard の編集モーダルと integrate する。
}

export function CalendarMobileDaySection({
  date,
  tasks,
  isToday = false,
}: CalendarMobileDaySectionProps) {
  const visible = tasks.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, tasks.length - MAX_VISIBLE);

  return (
    <section
      data-testid={`calendar-mobile-day-${date}`}
      className={[
        'rounded-xl border border-slate-200/85 p-3',
        isToday ? 'bg-indigo-50/30' : 'bg-white',
      ].join(' ')}
    >
      <h3
        className={[
          'mb-2 text-[13px] font-bold',
          isToday ? 'text-vn-accent' : 'text-slate-700',
        ].join(' ')}
      >
        {formatDateLabel(date)}
      </h3>
      {tasks.length === 0 ? (
        <p className="text-[11px] text-slate-400">なし</p>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((task) => (
            <TaskCard key={task.id} task={task} onEdit={noopEdit} />
          ))}
          {overflow > 0 && (
            <div
              data-testid={`calendar-mobile-overflow-${date}`}
              className="px-1.5 py-1 text-[11px] text-slate-500"
            >
              +{overflow} 件
            </div>
          )}
        </div>
      )}
    </section>
  );
}
