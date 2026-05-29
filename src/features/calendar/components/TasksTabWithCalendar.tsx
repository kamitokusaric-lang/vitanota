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
      content: <CalendarWeekView onEditTask={handleEditTask} />,
    },
    {
      id: 'month',
      label: '月',
      content: <CalendarMonthView onEditTask={handleEditTask} />,
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
        )}
      </Modal>
    </>
  );
}
