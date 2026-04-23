// タスクカンバンボード全体
// 4 カテゴリ (クラス業務/教科業務/イベント業務/事務業務 + 拡張) を横に並べる
// 絞込・新規/編集モーダルはこのコンポーネントで管理
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { Modal } from '@/shared/components/Modal';
import { useTasks, type TaskWithOwner } from '../hooks/useTasks';
import { useTaskCategories } from '../hooks/useTaskCategories';
import { useAssignees } from '../hooks/useAssignees';
import { AssigneeFilter } from './AssigneeFilter';
import { TaskColumn } from './TaskColumn';
import { TaskForm, toFormInitial, type TaskFormValues } from './TaskForm';

type ModalState =
  | { kind: 'closed' }
  | { kind: 'create'; categoryId?: string }
  | { kind: 'edit'; task: TaskWithOwner };

export function TaskBoard() {
  const { data: session } = useSession();
  const selfUserId = session?.user.userId ?? '';
  const isAdmin =
    session?.user.roles?.includes('school_admin') ||
    session?.user.roles?.includes('system_admin') ||
    false;

  const [filterOwner, setFilterOwner] = useState<string | undefined>();
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { tasks, error: tasksError, isLoading: tasksLoading, mutate: mutateTasks } =
    useTasks({ ownerUserId: filterOwner });
  const { categories, error: catsError, isLoading: catsLoading } = useTaskCategories();
  const { assignees } = useAssignees();

  const closeModal = () => {
    setModal({ kind: 'closed' });
    setFormError(null);
  };

  const handleCreate = async (values: TaskFormValues) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: values.categoryId,
          ownerUserId: isAdmin ? values.ownerUserId : undefined,
          title: values.title,
          description: values.description || undefined,
          dueDate: values.dueDate || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setFormError(body.message ?? 'タスクの作成に失敗しました');
        return;
      }
      await mutateTasks();
      closeModal();
    } finally {
      setSubmitting(false);
    }
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
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setFormError(body.message ?? 'タスクの更新に失敗しました');
        return;
      }
      await mutateTasks();
      closeModal();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm('このタスクを削除しますか?')) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (!res.ok) {
        alert('削除に失敗しました');
        return;
      }
      await mutateTasks();
      closeModal();
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (
    id: string,
    status: 'todo' | 'in_progress' | 'done',
  ) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      alert('ステータス更新に失敗しました');
      return;
    }
    await mutateTasks();
  };

  if (catsLoading || tasksLoading) {
    return (
      <div className="py-10 text-center">
        <LoadingSpinner label="タスクを読み込み中" />
      </div>
    );
  }
  if (catsError || tasksError) {
    return <ErrorMessage message="タスクの取得に失敗しました" />;
  }
  if (!categories || !tasks) {
    return null;
  }

  const tasksByCategory = new Map<string, TaskWithOwner[]>();
  for (const t of tasks) {
    const list = tasksByCategory.get(t.categoryId) ?? [];
    list.push(t);
    tasksByCategory.set(t.categoryId, list);
  }

  return (
    <div data-testid="task-board">
      <div className="mb-4 flex items-center justify-between">
        <AssigneeFilter
          value={filterOwner}
          onChange={setFilterOwner}
          assignees={assignees ?? []}
          selfUserId={selfUserId}
        />
        <Button
          type="button"
          onClick={() => setModal({ kind: 'create' })}
          className="text-xs"
          data-testid="task-board-new-button"
        >
          + 新規タスク
        </Button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {categories.map((category) => (
          <TaskColumn
            key={category.id}
            category={category}
            tasks={tasksByCategory.get(category.id) ?? []}
            onAdd={(categoryId) => setModal({ kind: 'create', categoryId })}
            onEdit={(task) => setModal({ kind: 'edit', task })}
            onStatusChange={handleStatusChange}
          />
        ))}
      </div>

      <Modal
        open={modal.kind === 'create'}
        onClose={closeModal}
        title="新規タスク"
      >
        {modal.kind === 'create' && (
          <TaskForm
            mode="create"
            initial={{ categoryId: modal.categoryId ?? categories[0]?.id }}
            categories={categories}
            assignees={assignees ?? []}
            canAssignToOthers={isAdmin}
            selfUserId={selfUserId}
            submitting={submitting}
            error={formError}
            onSubmit={handleCreate}
            onCancel={closeModal}
          />
        )}
      </Modal>

      <Modal
        open={modal.kind === 'edit'}
        onClose={closeModal}
        title="タスクの編集"
      >
        {modal.kind === 'edit' && (
          <TaskForm
            mode="edit"
            initial={toFormInitial(modal.task)}
            categories={categories}
            assignees={assignees ?? []}
            canAssignToOthers={isAdmin}
            selfUserId={selfUserId}
            submitting={submitting}
            error={formError}
            onSubmit={(values) => handleUpdate(modal.task.id, values)}
            onCancel={closeModal}
            onDelete={() => handleDelete(modal.task.id)}
          />
        )}
      </Modal>
    </div>
  );
}
