// タスクボード大タブ内の view 切り替え wrapper。
// URL ?tab=tasks&view=board|week|month で view 状態を保持。
//
// 編集モーダルは TaskEditModal (TaskBoard.tsx 内、 chimo 2026-05-30 で共通化) を import。
// 計算 / 状態管理 / handler は TaskEditModal 内に集約済、 calendar 側は「どのタスクを開くか」
// だけ管理する。 calendar 固有の「来週に渡す」 button は topSlot prop で挿入。
//
// 新規追加 modal (Phase 6 「+」 button から) は ManualTaskCreateForm をそのまま使用。
import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { ArrowRight } from 'lucide-react';
import { Modal } from '@/shared/components/Modal';
import { useToast } from '@/shared/components/Toast';
import {
  TaskBoard,
  TaskEditModal,
} from '@/features/tasks/components/TaskBoard';
import { Tabs, type TabDef } from '@/shared/components/Tabs';
import type { TaskWithAssignees } from '@/features/tasks/hooks/useTasks';
import { ManualTaskCreateForm } from '@/features/ai-chat/ManualTaskCreateForm';
import { CalendarWeekView } from './CalendarWeekView';
import { CalendarMonthView } from './CalendarMonthView';
import { getNextMondayFromDate } from '../lib/calendarDateRange';

const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

function formatMoveLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${m}/${d} (${WEEK_LABELS[date.getDay()]})`;
}

function dueDateToBase(value: string | Date | null): Date | string {
  if (!value) return new Date();
  // API response の dueDate は ISO string ("YYYY-MM-DDTHH:MM:SS.sssZ") で来ることがある。
  // calendarDateRange.parseYmd は "YYYY-MM-DD" を期待するので先頭 10 文字に切り詰める。
  if (typeof value === 'string') return value.slice(0, 10);
  return value;
}

interface TasksTabWithCalendarProps {
  selfUserId: string;
}

export function TasksTabWithCalendar({
  selfUserId,
}: TasksTabWithCalendarProps) {
  const { mutate: globalMutate } = useSWRConfig();
  const { showToast } = useToast();

  const [editing, setEditing] = useState<TaskWithAssignees | null>(null);
  // Phase 6: カレンダー日付セル「+」 で開く新規作成 modal の対象日。
  const [createDate, setCreateDate] = useState<string | null>(null);

  const handleEditTask = (task: TaskWithAssignees) => setEditing(task);
  const handleCloseEdit = () => setEditing(null);

  const handleAddTask = (date: string) => setCreateDate(date);
  const handleCloseCreate = () => setCreateDate(null);

  const invalidateTasks = () =>
    globalMutate(
      (key: unknown) =>
        typeof key === 'string' && key.startsWith('/api/tasks'),
    );

  const handleMoveTask = async (taskId: string, newDate: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: newDate }),
      });
      if (!res.ok) {
        showToast('日付の変更に失敗しました', 'error');
        return;
      }
      await invalidateTasks();
      showToast(`${formatMoveLabel(newDate)} に移動しました`, 'success');
    } catch {
      showToast('日付の変更に失敗しました', 'error');
    }
  };

  const handlePushToNextWeek = async (task: TaskWithAssignees) => {
    const nextMonday = getNextMondayFromDate(dueDateToBase(task.dueDate));
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: nextMonday }),
      });
      if (!res.ok) {
        showToast('来週への移動に失敗しました', 'error');
        return;
      }
      await invalidateTasks();
      handleCloseEdit();
      showToast('来週に渡しました', 'success');
    } catch {
      showToast('来週への移動に失敗しました', 'error');
    }
  };

  const tabs: TabDef[] = [
    {
      id: 'board',
      label: 'ボード',
      content: <TaskBoard selfUserId={selfUserId} />,
    },
    {
      id: 'week',
      label: '週',
      content: (
        <CalendarWeekView
          onEditTask={handleEditTask}
          onMoveTask={handleMoveTask}
          onAddTask={handleAddTask}
        />
      ),
    },
    {
      id: 'month',
      label: '月',
      content: (
        <CalendarMonthView
          onEditTask={handleEditTask}
          onMoveTask={handleMoveTask}
          onAddTask={handleAddTask}
        />
      ),
    },
  ];

  return (
    <>
      <Tabs tabs={tabs} defaultTabId="board" queryParam="view" />
      <TaskEditModal
        task={editing}
        selfUserId={selfUserId}
        onClose={handleCloseEdit}
        topSlot={(task) => {
          // calendar 経由のみ「来週に渡す」 button を編集モーダル上部に挿入。
          // done タスク / 他人のタスク (= readonly) は対象外。
          if (task.status === 'done') return null;
          if (!task.assignees.some((a) => a.userId === selfUserId)) return null;
          return (
            <div className="mb-3 flex items-center justify-end">
              <button
                type="button"
                onClick={() => handlePushToNextWeek(task)}
                data-testid="calendar-push-to-next-week"
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-vn-accent px-5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-indigo-700 hover:shadow-md"
              >
                <ArrowRight size={16} strokeWidth={2} aria-hidden />
                来週に渡す
              </button>
            </div>
          );
        }}
      />
      <Modal
        open={createDate !== null}
        onClose={handleCloseCreate}
        title="タスクを追加"
        maxWidth="max-w-3xl"
      >
        {createDate && (
          <ManualTaskCreateForm
            selfUserId={selfUserId}
            initialDueDate={createDate}
            onSuccess={handleCloseCreate}
          />
        )}
      </Modal>
    </>
  );
}
