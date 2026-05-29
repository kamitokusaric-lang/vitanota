// タスクボード大タブ内の view 切り替え wrapper。
// URL ?tab=tasks&view=board|week|month で view 状態を保持。
// 既存 Tabs component を queryParam="view" で流用、 各 view の出し分けを 1 段で処理。
// view='board' (default) は既存 TaskBoard の挙動を完全踏襲。
//
// 編集モーダル integrate (Phase 2 refinement):
// - calendar 側 (week / month) のタスクカードクリック → 親で edit state 管理 →
//   TaskForm を render (TaskBoard と同じ動線、 同じ /api/tasks ↔ /api/tasks/[id] endpoint)
// - cache は global mutate で /api/tasks を invalidate (TaskBoard 側 cache も同期)
import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { ArrowRight } from 'lucide-react';
import { Modal } from '@/shared/components/Modal';
import { useToast } from '@/shared/components/Toast';
import { TaskBoard } from '@/features/tasks/components/TaskBoard';
import { Tabs, type TabDef } from '@/shared/components/Tabs';
import {
  TaskForm,
  toFormInitial,
  type TaskFormValues,
} from '@/features/tasks/components/TaskForm';
import { useTaskCategories } from '@/features/tasks/hooks/useTaskCategories';
import { useAssignees } from '@/features/tasks/hooks/useAssignees';
import { useTaskTags, type TaskTag } from '@/features/tasks/hooks/useTaskTags';
import type { TaskWithAssignees } from '@/features/tasks/hooks/useTasks';
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
  const { categories } = useTaskCategories();
  const { assignees } = useAssignees();
  const { tags: taskTags, mutate: mutateTags } = useTaskTags();

  const [editing, setEditing] = useState<TaskWithAssignees | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleEditTask = (task: TaskWithAssignees) => {
    setEditing(task);
    setFormError(null);
  };

  const handleClose = () => {
    setEditing(null);
    setFormError(null);
  };

  const handleUpdate = async (taskId: string, values: TaskFormValues) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: values.categoryId,
          title: values.title,
          description: values.description || null,
          dueDate: values.dueDate || null,
          status: values.status,
          assigneeUserIds: values.assigneeUserIds,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        setFormError(body.message ?? 'タスクの更新に失敗しました');
        return;
      }
      // タグ差分更新 (空配列でも全削除を意味するので常に PUT)
      await fetch(`/api/tasks/${taskId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds: values.tagIds }),
      });
      // /api/tasks 系の全 cache を再 fetch (TaskBoard + calendar 両方の view に反映)
      await globalMutate(
        (key) => typeof key === 'string' && key.startsWith('/api/tasks'),
      );
      handleClose();
      showToast('タスクを更新しました', 'success');
    } finally {
      setSubmitting(false);
    }
  };

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
      await globalMutate(
        (key) => typeof key === 'string' && key.startsWith('/api/tasks'),
      );
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
      await globalMutate(
        (key) => typeof key === 'string' && key.startsWith('/api/tasks'),
      );
      handleClose();
      showToast('来週に渡しました', 'success');
    } catch {
      showToast('来週への移動に失敗しました', 'error');
    }
  };

  const handleCreateTag = async (name: string): Promise<TaskTag | null> => {
    const res = await fetch('/api/task-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message ?? 'タグ作成に失敗しました');
    }
    const { tag } = (await res.json()) as { tag: TaskTag };
    await mutateTags();
    return tag;
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
        />
      ),
    },
  ];

  return (
    <>
      <Tabs tabs={tabs} defaultTabId="board" queryParam="view" />
      <Modal
        open={!!editing}
        onClose={handleClose}
        title="タスクを編集"
        maxWidth="max-w-xl"
      >
        {editing && (
          <>
            {editing.status !== 'done' && (
              <div className="mb-3 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => handlePushToNextWeek(editing)}
                  disabled={submitting}
                  data-testid="calendar-push-to-next-week"
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-vn-accent px-5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-indigo-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowRight size={16} strokeWidth={2} aria-hidden />
                  来週に渡す
                </button>
              </div>
            )}
            <TaskForm
              mode="edit"
              initial={toFormInitial(editing)}
              categories={categories ?? []}
              assignees={assignees ?? []}
              canAssignToOthers
              selfUserId={selfUserId}
              submitting={submitting}
              error={formError}
              taskTags={taskTags ?? []}
              onCreateTag={handleCreateTag}
              onSubmit={(values) => handleUpdate(editing.id, values)}
              onCancel={handleClose}
            />
          </>
        )}
      </Modal>
    </>
  );
}
