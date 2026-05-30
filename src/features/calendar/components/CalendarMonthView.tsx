// 月表示の統合 view。
// - PC (xl 以上): 5-6 行 × 7 列 grid (CalendarMonthCell、 compact タスク行 3 件まで)
// - mobile (xl 未満): 月全体を CalendarMobileDaySection の縦リスト (35-42 セクション)
// - 月ナビ (CalendarMonthNav) で月移動
// - 日付ヘッダ / 「+N 件」 クリックで詳細モーダル (CalendarDayDetailModal)
// - タスク行クリックで編集モーダル (onEditTask、 親 TasksTabWithCalendar が制御)
import { useMemo, useState } from 'react';
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
import type { SharedFilters } from '@/features/tasks/components/TaskBoard';
import { applyClientSideFilters } from '../lib/applyClientSideFilters';
import { fireCalendarEvent } from '../lib/calendarAnalytics';

interface CalendarMonthViewProps {
  selfUserId: string;
  filters: SharedFilters;
  onEditTask: (task: TaskWithAssignees) => void;
  // fromDate は drop 元の dueDate (null = 未設定タスク)、 toDate は drop 先セル。
  onMoveTask?: (taskId: string, fromDate: string | null, toDate: string) => void;
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
  selfUserId,
  filters,
  onEditTask,
  onMoveTask,
  onAddTask,
}: CalendarMonthViewProps) {
  const [monthGrid, setMonthGrid] = useState<MonthGrid>(() => getMonthGrid());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = todayYmd();

  const { tasks: rawTasks, isLoading, error } = useCalendarTasks({
    from: monthGrid.gridFrom,
    to: monthGrid.gridTo,
    selfUserId,
    filterOwner: filters.filterOwner,
  });

  const tasks = useMemo(
    () =>
      rawTasks
        ? applyClientSideFilters(rawTasks, filters, selfUserId)
        : undefined,
    [rawTasks, filters, selfUserId],
  );

  const grouped = tasks
    ? groupByDate(tasks)
    : new Map<string, TaskWithAssignees[]>();
  const selectedTasks = selectedDate ? (grouped.get(selectedDate) ?? []) : [];

  const handlePrev = () => setMonthGrid(shiftMonth(monthGrid.monthStart, -1));
  const handleNext = () => setMonthGrid(shiftMonth(monthGrid.monthStart, 1));
  const handleToday = () => setMonthGrid(getMonthGrid());
  const handleSelectDate = (date: string) => {
    fireCalendarEvent({ event: 'calendar_day_detail_opened', date });
    setSelectedDate(date);
  };
  const handleCloseModal = () => setSelectedDate(null);

  // セル (drop 先 = toDate のみ知る) からの move を受け、 tasks から drop 元の
  // dueDate を fromDate として解決して親に渡す。 同日 drop は no-op なので無視。
  const handleCellMove = onMoveTask
    ? (taskId: string, toDate: string) => {
        const fromDate = tasks
          ? dueDateToYmd(tasks.find((t) => t.id === taskId)?.dueDate ?? null)
          : null;
        if (fromDate === toDate) return;
        onMoveTask(taskId, fromDate, toDate);
      }
    : undefined;

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
              {monthGrid.weeks.map((week) => {
                const isCurrentWeek = week.includes(today);
                return week.map((date) => (
                  <CalendarMonthCell
                    key={date}
                    date={date}
                    tasks={grouped.get(date) ?? []}
                    isToday={date === today}
                    outOfMonth={isOutOfMonth(date, monthGrid.monthStart)}
                    isCurrentWeek={isCurrentWeek}
                    maxVisible={3}
                    onSelectDate={handleSelectDate}
                    onEditTask={onEditTask}
                    onMoveTask={handleCellMove}
                    onAddTask={onAddTask}
                  />
                ));
              })}
            </div>
          </div>
          {/* mobile (xl 未満): 月全体 の縦リスト、 今週 section は薄背景 */}
          <div className="flex flex-col gap-2 xl:hidden">
            {monthGrid.weeks.map((week) => {
              const isCurrentWeek = week.includes(today);
              return week.map((date) => (
                <CalendarMobileDaySection
                  key={date}
                  date={date}
                  tasks={grouped.get(date) ?? []}
                  isToday={date === today}
                  outOfMonth={isOutOfMonth(date, monthGrid.monthStart)}
                  isCurrentWeek={isCurrentWeek}
                  maxVisible={3}
                  onSelectDate={handleSelectDate}
                  onEditTask={onEditTask}
                  onAddTask={onAddTask}
                />
              ));
            })}
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
