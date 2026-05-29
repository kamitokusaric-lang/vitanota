// 週表示の統合 view。 PC = 7 列 grid、 mobile (xl 未満) = 縦リスト。
// tasks は scope='mine' + dueDate が週内のものを useCalendarTasks で取得。
// dueDate=null のタスクは calendar に出ない (タスクボード経由で扱う)。
import { useState } from 'react';
import { useCalendarTasks } from '../hooks/useCalendarTasks';
import {
  getWeekRange,
  shiftWeek,
  todayYmd,
  type WeekRange,
} from '../lib/calendarDateRange';
import { CalendarDayCell } from './CalendarDayCell';
import { CalendarMobileDaySection } from './CalendarMobileDaySection';
import { CalendarWeekNav } from './CalendarWeekNav';
import type { TaskWithAssignees } from '@/features/tasks/hooks/useTasks';

function dueDateToYmd(value: string | Date | null): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function groupByDate(
  tasks: TaskWithAssignees[],
): Map<string, TaskWithAssignees[]> {
  const map = new Map<string, TaskWithAssignees[]>();
  for (const task of tasks) {
    const ymd = dueDateToYmd(task.dueDate);
    if (!ymd) continue;
    const arr = map.get(ymd) ?? [];
    arr.push(task);
    map.set(ymd, arr);
  }
  return map;
}

export function CalendarWeekView() {
  const [range, setRange] = useState<WeekRange>(() => getWeekRange());
  const today = todayYmd();

  const { tasks, isLoading, error } = useCalendarTasks({
    from: range.weekStart,
    to: range.weekEnd,
  });

  const grouped = tasks ? groupByDate(tasks) : new Map<string, TaskWithAssignees[]>();

  return (
    <div data-testid="calendar-week-view">
      <CalendarWeekNav
        weekStart={range.weekStart}
        weekEnd={range.weekEnd}
        onPrev={() => setRange(shiftWeek(range.weekStart, -1))}
        onNext={() => setRange(shiftWeek(range.weekStart, 1))}
        onToday={() => setRange(getWeekRange())}
      />

      {isLoading && (
        <div
          className="py-8 text-center text-sm text-slate-500"
          data-testid="calendar-week-loading"
        >
          読み込み中…
        </div>
      )}
      {error && (
        <div
          className="py-8 text-center text-sm text-red-600"
          data-testid="calendar-week-error"
        >
          読み込みに失敗しました
        </div>
      )}

      {!isLoading && !error && (
        <>
          {/* PC (xl 以上): 7 列 grid */}
          <div className="hidden xl:grid xl:grid-cols-7 xl:gap-2">
            {range.days.map((date) => (
              <CalendarDayCell
                key={date}
                date={date}
                tasks={grouped.get(date) ?? []}
                isToday={date === today}
              />
            ))}
          </div>
          {/* mobile (xl 未満): 縦リスト */}
          <div className="flex flex-col gap-3 xl:hidden">
            {range.days.map((date) => (
              <CalendarMobileDaySection
                key={date}
                date={date}
                tasks={grouped.get(date) ?? []}
                isToday={date === today}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
