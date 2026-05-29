// カレンダー用のタスク取得 hook。 既存 useTasks の薄いラッパー。
// scope='mine' + mode='range' で「自分担当・指定期間の dueDate」 のみを返す。
import { useTasks } from '@/features/tasks/hooks/useTasks';

export interface UseCalendarTasksOpts {
  from: string; // YYYY-MM-DD (含む)
  to: string;   // YYYY-MM-DD (含む)
}

export function useCalendarTasks(opts: UseCalendarTasksOpts) {
  return useTasks({
    scope: 'mine',
    dateFilter: { mode: 'range', from: opts.from, to: opts.to },
  });
}
