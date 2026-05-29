// タスクボード大タブ内の view 切り替え wrapper。
// URL ?tab=tasks&view=board|week|month で view 状態を保持。
// 既存 Tabs component を使って segmented control + 各 view の出し分けを 1 段で処理。
// view='board' (default) は既存 TaskBoard の挙動を完全踏襲、 既存ユーザーへの影響ゼロ。
import { TaskBoard } from '@/features/tasks/components/TaskBoard';
import { Tabs, type TabDef } from '@/shared/components/Tabs';
import { CalendarWeekView } from './CalendarWeekView';

interface TasksTabWithCalendarProps {
  selfUserId: string;
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div
      className="py-16 text-center text-sm text-gray-400"
      data-testid={`calendar-coming-soon-${label}`}
    >
      {label} は準備中です
    </div>
  );
}

export function TasksTabWithCalendar({ selfUserId }: TasksTabWithCalendarProps) {
  const tabs: TabDef[] = [
    {
      id: 'board',
      label: 'ボード',
      content: <TaskBoard selfUserId={selfUserId} />,
    },
    {
      id: 'week',
      label: '週',
      content: <CalendarWeekView />,
    },
    {
      id: 'month',
      label: '月',
      content: <ComingSoon label="月表示" />,
    },
  ];
  return <Tabs tabs={tabs} defaultTabId="board" queryParam="view" />;
}
