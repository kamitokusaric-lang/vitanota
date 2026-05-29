// 月表示の統合 view。
// - PC (xl 以上): 5-6 行 × 7 列 grid (CalendarMonthCell、 compact タスク行 3 件まで)
// - mobile (xl 未満): 月全体を CalendarMobileDaySection の縦リスト (35-42 セクション)
// - 月ナビ (CalendarMonthNav) で月移動
// - 日付ヘッダ / 「+N 件」 クリックで詳細モーダル (CalendarDayDetailModal)
// - タスク行クリックで編集モーダル (onEditTask、 親 TasksTabWithCalendar が制御)
import { useState } from 'react';
import { useCalendarTasks } from '../hooks/useCalendarTasks';
import {
  getMonthGrid,
  shiftMonth,
  todayYmd,
  isOutOfMonth,
  type MonthGrid,
} from '../lib/calendarDateRange';
import { CalendarMonthCell } from './CalendarMonthCell';
import { CalendarMobileDaySection } from './CalendarMobileDaySection';
import { CalendarMonthNav } from './CalendarMonthNav';
import { CalendarDayDetailModal } from './CalendarDayDetailModal';
import type { TaskWithAssignees } from '@/features/tasks/hooks/useTasks';

interface CalendarMonthViewProps {
  onEditTask: (task: TaskWithAssignees) => void;
  onMoveTask?: (taskId: string, newDate: string) => void;
  onAddTask?: (date: string) => void;
}

const WEEKDAY_HEADERS = ['月', '火', '水', '木', '金', '土', '日'] as const;

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

export function CalendarMonthView({
  onEditTask,
  onMoveTask,
  onAddTask,
}: CalendarMonthViewProps) {
  const [monthGrid, setMonthGrid] = useState<MonthGrid>(() => getMonthGrid());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = todayYmd();

  const { tasks, isLoading, error } = useCalendarTasks({
    from: monthGrid.gridFrom,
    to: monthGrid.gridTo,
  });

  const grouped = tasks
    ? groupByDate(tasks)
    : new Map<string, TaskWithAssignees[]>();
  const selectedTasks = selectedDate ? (grouped.get(selectedDate) ?? []) : [];

  const handlePrev = () => setMonthGrid(shiftMonth(monthGrid.monthStart, -1));
  const handleNext = () => setMonthGrid(shiftMonth(monthGrid.monthStart, 1));
  const handleToday = () => setMonthGrid(getMonthGrid());
  const handleSelectDate = (date: string) => setSelectedDate(date);
  const handleCloseModal = () => setSelectedDate(null);

  return (
    <div data-testid="calendar-month-view">
      <CalendarMonthNav
        monthLabel={monthGrid.monthLabel}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
      />

      {isLoading && (
        <div
          className="py-8 text-center text-sm text-slate-500"
          data-testid="calendar-month-loading"
        >
          読み込み中…
        </div>
      )}
      {error && (
        <div
          className="py-8 text-center text-sm text-red-600"
          data-testid="calendar-month-error"
        >
          読み込みに失敗しました
        </div>
      )}

      {!isLoading && !error && (
        <>
          {/* PC (xl 以上): 5-6 行 × 7 列 grid */}
          <div className="hidden xl:block">
            <div className="mb-1 grid grid-cols-7 gap-1.5 text-center">
              {WEEKDAY_HEADERS.map((label) => (
                <div
                  key={label}
                  className="text-[11px] font-semibold text-slate-500"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {monthGrid.weeks.flat().map((date) => (
                <CalendarMonthCell
                  key={date}
                  date={date}
                  tasks={grouped.get(date) ?? []}
                  isToday={date === today}
                  outOfMonth={isOutOfMonth(date, monthGrid.monthStart)}
                  maxVisible={3}
                  onSelectDate={handleSelectDate}
                  onEditTask={onEditTask}
                  onMoveTask={onMoveTask}
                  onAddTask={onAddTask}
                />
              ))}
            </div>
          </div>
          {/* mobile (xl 未満): 月全体 の縦リスト (週 view と同じ section component を流用) */}
          <div className="flex flex-col gap-2 xl:hidden">
            {monthGrid.weeks.flat().map((date) => (
              <CalendarMobileDaySection
                key={date}
                date={date}
                tasks={grouped.get(date) ?? []}
                isToday={date === today}
                outOfMonth={isOutOfMonth(date, monthGrid.monthStart)}
                maxVisible={3}
                onSelectDate={handleSelectDate}
                onEditTask={onEditTask}
              />
            ))}
          </div>
        </>
      )}

      <CalendarDayDetailModal
        open={selectedDate !== null}
        date={selectedDate}
        tasks={selectedTasks}
        onClose={handleCloseModal}
        onEditTask={onEditTask}
      />
    </div>
  );
}
