// タスク編集モーダル (共通 component)
//
// 用途: TodayPlanView / PlanResultModal でタスクタイトルクリック時に開く。
// TaskBoard 内編集モーダルとは別物 (TaskBoard は複製機能あり、こちらは編集 + 削除のみ)。
//
// 仕様 (chimo 2026-05-17):
//   - 自分が assignee なら編集可能 + 削除可能
//   - 他人のタスクは readonly (TaskBoard と同じロジック)
//   - 複製機能なし (= TodayPlanView 文脈では使われない)
//   - taskId から /api/tasks/:id で fetch して TaskWithAssignees を取得
//   - 更新/削除成功で親に callback 通知 (= 親側で SWR 再 fetch 等)
import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/shared/components/Modal';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { useToast } from '@/shared/components/Toast';
import { useTask } from '../hooks/useTask';
import { useTaskCategories } from '../hooks/useTaskCategories';
import { useAssignees } from '../hooks/useAssignees';
import { useTaskTags, type TaskTag } from '../hooks/useTaskTags';
import { TaskForm, toFormInitial, type TaskFormValues } from './TaskForm';
import { TaskCommentSection } from './TaskCommentSection';

interface Props {
  taskId: string | null;
  selfUserId: string;
  onClose: () => void;
  onUpdated?: () => void; // 更新成功時、呼び出し側で SWR 再 fetch
  onDeleted?: () => void;
}

export function TaskEditModal({
  taskId,
  selfUserId,
  onClose,
  onUpdated,
  onDeleted,
}: Props) {
  const { task, isLoading, error } = useTask(taskId);
  const { categories } = useTaskCategories();
  const { assignees } = useAssignees();
  const { tags: taskTags, mutate: mutateTags } = useTaskTags();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { showToast } = useToast();

  const isMine =
    task?.assignees.some((a) => a.userId === selfUserId) ?? false;
  const readonly = !isMine;

  const handleUpdate = async (values: TaskFormValues) => {
    if (!task) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
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
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setFormError(body.message ?? 'タスクの更新に失敗しました');
        return;
      }
      // タグ差分更新 (空配列でも全削除なので常に PUT)
      await fetch(`/api/tasks/${task.id}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds: values.tagIds }),
      });
      onUpdated?.();
      onClose();
      showToast('タスクを更新しました', 'success');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    if (!confirm('このタスクを削除しますか?')) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      if (!res.ok) {
        showToast('削除に失敗しました', 'error');
        return;
      }
      onDeleted?.();
      onClose();
      showToast('タスクを削除しました', 'success');
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

  return (
    <Modal
      open={taskId !== null}
      onClose={onClose}
      title={
        task ? (
          <div className="flex items-center justify-between">
            <span>{isMine ? 'タスクの編集' : 'タスクを見る'}</span>
            {isMine && <TaskDeleteKebabMenu onDelete={handleDelete} />}
          </div>
        ) : undefined
      }
      maxWidth="max-w-xl"
    >
      {isLoading && (
        <div className="py-6 text-center">
          <LoadingSpinner label="タスクを読み込み中" />
        </div>
      )}
      {error && <ErrorMessage message="タスクの取得に失敗しました" />}
      {task && categories && (
        <>
          <TaskForm
            mode="edit"
            initial={toFormInitial(task)}
            categories={categories}
            assignees={assignees ?? []}
            canAssignToOthers
            selfUserId={selfUserId}
            submitting={submitting}
            error={formError}
            readonly={readonly}
            taskTags={taskTags ?? []}
            onCreateTag={handleCreateTag}
            onSubmit={handleUpdate}
            onCancel={onClose}
          />
          <TaskCommentSection
            taskId={task.id}
            selfUserId={selfUserId}
            canDeleteAny={false}
          />
        </>
      )}
    </Modal>
  );
}

// 編集モーダル右上の 3 点リーダーメニュー (削除のみ、複製なし)
function TaskDeleteKebabMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md px-2 py-1 text-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        aria-label="メニュー"
        data-testid="task-edit-menu-button"
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
            data-testid="task-edit-menu-delete"
          >
            タスクを削除
          </button>
        </div>
      )}
    </div>
  );
}
