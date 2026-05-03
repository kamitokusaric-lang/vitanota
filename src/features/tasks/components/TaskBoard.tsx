// タスクカンバンボード全体
// 4 カテゴリ (クラス業務/教科業務/イベント業務/事務業務 + 拡張) を横に並べる
// 絞込・新規/編集モーダルはこのコンポーネントで管理
// デフォルトは「自分」(= scope='mine'、assignee + requester 両方を含む)
import { useMemo, useState } from 'react';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { Modal } from '@/shared/components/Modal';
import { useToast } from '@/shared/components/Toast';
import { useTasks, type TaskWithOwner } from '../hooks/useTasks';
import { useTaskCategories } from '../hooks/useTaskCategories';
import { useAssignees } from '../hooks/useAssignees';
import { AssigneeFilter } from './AssigneeFilter';
import { TagFilter } from './TagFilter';
import { TaskMatrix, type MatrixGroup } from './TaskMatrix';
import {
  TaskBulkCreateForm,
  type BulkCreateValues,
} from './TaskBulkCreateForm';
import { useTaskTags } from '../hooks/useTaskTags';
import { TaskForm, toFormInitial, type TaskFormValues } from './TaskForm';
import { TaskCommentSection } from './TaskCommentSection';

type ModalState =
  | { kind: 'closed' }
  | { kind: 'create'; categoryId?: string }
  | { kind: 'edit'; task: TaskWithOwner }
  | { kind: 'duplicate'; sourceTask: TaskWithOwner };

interface TaskBoardProps {
  selfUserId: string;
}

export function TaskBoard({ selfUserId }: TaskBoardProps) {
  // フィルタの意味:
  //   filterOwner === selfUserId → scope='mine' (assignee OR requester 両方)
  //   filterOwner === <他ユーザーID> → ownerUserId 指定 (その人が assignee のもののみ)
  //   filterOwner === undefined → 全員
  const [filterOwner, setFilterOwner] = useState<string | undefined>(selfUserId);
  // タグフィルタ (担当者フィルタと同じく single-select)
  const [filterTagId, setFilterTagId] = useState<string | undefined>(undefined);
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { showToast } = useToast();

  const taskQueryOptions =
    filterOwner === selfUserId
      ? ({ scope: 'mine' } as const)
      : filterOwner
        ? { ownerUserId: filterOwner }
        : {};
  const {
    tasks: rawTasks,
    error: tasksError,
    isLoading: tasksLoading,
    mutate: mutateTasks,
  } = useTasks(taskQueryOptions);

  // 期限が早い順にソート (期限なしは末尾)
  const tasks = useMemo(() => {
    if (!rawTasks) return undefined;
    return [...rawTasks].sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }, [rawTasks]);
  const { categories, error: catsError, isLoading: catsLoading } = useTaskCategories();
  const { assignees } = useAssignees();
  const { tags: taskTags, mutate: mutateTags } = useTaskTags();

  const closeModal = () => {
    setModal({ kind: 'closed' });
    setFormError(null);
  };

  // 一括作成: 各行を順次 POST /api/tasks → コメント / タグも個別反映
  const handleBulkCreate = async (values: BulkCreateValues) => {
    setSubmitting(true);
    setFormError(null);
    try {
      let createdCount = 0;
      let failedCount = 0;
      for (const row of values.rows) {
        try {
          const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              categoryId: values.categoryId,
              ownerUserId: row.ownerUserId,
              title: row.title,
              description: row.description || undefined,
              dueDate: row.dueDate || undefined,
            }),
          });
          if (!res.ok) {
            failedCount++;
            continue;
          }
          const { task } = (await res.json()) as { task: { id: string } };

          const initialComment = row.initialComment.trim();
          if (initialComment) {
            await fetch(`/api/tasks/${task.id}/comments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ body: initialComment }),
            });
          }

          if (values.tagIds.length > 0) {
            await fetch(`/api/tasks/${task.id}/tags`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tagIds: values.tagIds }),
            });
          }

          createdCount++;
        } catch {
          failedCount++;
        }
      }

      await mutateTasks();
      if (failedCount === 0) {
        showToast(`${createdCount} 件のタスクを登録しました`, 'success');
        closeModal();
      } else if (createdCount === 0) {
        setFormError('すべての行の作成に失敗しました');
      } else {
        showToast(
          `${createdCount} 件登録しました (${failedCount} 件失敗)`,
          'error',
        );
        closeModal();
      }
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
      // タグ差分更新 (空配列でも全削除を意味するので常に PUT)
      await fetch(`/api/tasks/${taskId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds: values.tagIds }),
      });
      await mutateTasks();
      closeModal();
      showToast('タスクを更新しました', 'success');
    } finally {
      setSubmitting(false);
    }
  };

  // タグ作成 (TaskForm から呼ぶ)
  const handleCreateTag = async (name: string) => {
    const res = await fetch('/api/task-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message ?? 'タグ作成に失敗しました');
    }
    const { tag } = (await res.json()) as {
      tag: import('../hooks/useTaskTags').TaskTag;
    };
    await mutateTags();
    return tag;
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm('このタスクを削除しますか?')) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (!res.ok) {
        showToast('削除に失敗しました', 'error');
        return;
      }
      await mutateTasks();
      closeModal();
      showToast('タスクを削除しました', 'success');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDuplicate = async (sourceTaskId: string, values: TaskFormValues) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/tasks/${sourceTaskId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerUserId: values.ownerUserId,
          categoryId: values.categoryId,
          title: values.title,
          description: values.description || null,
          dueDate: values.dueDate || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setFormError(body.message ?? 'タスクの複製に失敗しました');
        return;
      }
      const { task } = (await res.json()) as { task: { id: string } };
      // 複製先にタグも継承する (フォームで操作した結果の tagIds)
      if (values.tagIds.length > 0) {
        await fetch(`/api/tasks/${task.id}/tags`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tagIds: values.tagIds }),
        });
      }
      await mutateTasks();
      closeModal();
      const ownerLabel = (() => {
        if (values.ownerUserId === selfUserId) return '自分';
        const a = (assignees ?? []).find((x) => x.userId === values.ownerUserId);
        return a?.name ?? '他の先生';
      })();
      showToast(
        `${ownerLabel}のタスクとして「${values.title}」を複製しました`,
        'success',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // 横方向ドラッグ&ドロップで status 変更
  const handleDropStatus = async (
    taskId: string,
    newStatus: 'todo' | 'in_progress' | 'done',
  ) => {
    const target = tasks?.find((t) => t.id === taskId);
    if (!target || target.status === newStatus) return;
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) {
      showToast('ステータスの更新に失敗しました', 'error');
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

  // フィルタ適用後のタスク (タグフィルタのみ、担当者は API 側で適用済)
  const filteredTasks = tasks.filter((t) => {
    if (filterTagId && !t.tags.some((tg) => tg.id === filterTagId)) return false;
    return true;
  });

  // 縦軸 (横軸は status × 3 固定):
  //   - タグ絞込中: カテゴリでグルーピングせず 1 行に集約 (label = タグ名)
  //   - タグ絞込なし: タスクがあるカテゴリのみ並べる (0 件カテゴリは隠す)
  const TAG_FILTERED_ROW_ID = '__tag_filtered__';
  const rows: MatrixGroup[] = filterTagId
    ? (() => {
        const tag = (taskTags ?? []).find((t) => t.id === filterTagId);
        return tag
          ? [{ id: TAG_FILTERED_ROW_ID, label: `#${tag.name}` }]
          : [];
      })()
    : (() => {
        const usedIds = new Set(filteredTasks.map((t) => t.categoryId));
        return categories
          .filter((c) => usedIds.has(c.id))
          .map((c) => ({ id: c.id, label: c.name }));
      })();

  // タスク → 行 id 配列
  const assignTaskToRows = (t: TaskWithOwner): string[] => {
    if (filterTagId) return [TAG_FILTERED_ROW_ID];
    return [t.categoryId];
  };

  return (
    <div data-testid="task-board">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <AssigneeFilter
            value={filterOwner}
            onChange={setFilterOwner}
            assignees={assignees ?? []}
            selfUserId={selfUserId}
          />
          <TagFilter
            value={filterTagId}
            onChange={setFilterTagId}
            tags={taskTags ?? []}
          />
        </div>
        <Button
          type="button"
          onClick={() => setModal({ kind: 'create' })}
          className="text-xs"
          data-testid="task-board-new-button"
        >
          + 新規タスク
        </Button>
      </div>

      <TaskMatrix
        tasks={filteredTasks}
        rows={rows}
        assignTaskToRows={assignTaskToRows}
        selfUserId={selfUserId}
        onEdit={(task) => setModal({ kind: 'edit', task })}
        onTaskDropStatus={handleDropStatus}
      />

      <Modal
        open={modal.kind === 'create'}
        onClose={closeModal}
        title="新規タスク (一括追加)"
        maxWidth="max-w-5xl"
      >
        {modal.kind === 'create' && (
          <TaskBulkCreateForm
            categories={categories}
            assignees={assignees ?? []}
            selfUserId={selfUserId}
            taskTags={taskTags ?? []}
            submitting={submitting}
            error={formError}
            onCreateTag={handleCreateTag}
            onSubmit={handleBulkCreate}
            onCancel={closeModal}
          />
        )}
      </Modal>

      <Modal
        open={modal.kind === 'edit'}
        onClose={closeModal}
        title={
          modal.kind === 'edit' && modal.task.ownerUserId !== selfUserId
            ? 'タスクを見る'
            : 'タスクの編集'
        }
        maxWidth="max-w-lg"
      >
        {modal.kind === 'edit' && (
          <>
            <TaskForm
              mode="edit"
              initial={toFormInitial(modal.task)}
              categories={categories}
              assignees={assignees ?? []}
              canAssignToOthers
              selfUserId={selfUserId}
              submitting={submitting}
              error={formError}
              readonly={modal.task.ownerUserId !== selfUserId}
              taskTags={taskTags ?? []}
              onCreateTag={handleCreateTag}
              onSubmit={(values) => handleUpdate(modal.task.id, values)}
              onCancel={closeModal}
              onDelete={() => handleDelete(modal.task.id)}
            />
            <div className="mt-2 border-t border-gray-100 pt-3">
              <Button
                variant="secondary"
                type="button"
                onClick={() =>
                  modal.kind === 'edit' &&
                  setModal({ kind: 'duplicate', sourceTask: modal.task })
                }
                className="text-xs"
                data-testid="task-edit-duplicate-button"
              >
                このタスクを別の先生と共有する (複製)
              </Button>
            </div>
            <TaskCommentSection
              taskId={modal.task.id}
              selfUserId={selfUserId}
              canDeleteAny={false}
            />
          </>
        )}
      </Modal>

      <Modal
        open={modal.kind === 'duplicate'}
        onClose={closeModal}
        title="タスクを複製"
        maxWidth="max-w-lg"
      >
        {modal.kind === 'duplicate' && (
          <>
            <p className="mb-3 text-xs text-gray-600" data-testid="task-duplicate-source">
              元タスク「{modal.sourceTask.title}」をコピーします。担当者を選択してください。
            </p>
            <TaskForm
              mode="duplicate"
              initial={{ ...toFormInitial(modal.sourceTask), ownerUserId: '' }}
              categories={categories}
              assignees={assignees ?? []}
              canAssignToOthers
              selfUserId={selfUserId}
              submitting={submitting}
              error={formError}
              taskTags={taskTags ?? []}
              onCreateTag={handleCreateTag}
              onSubmit={(values) => handleDuplicate(modal.sourceTask.id, values)}
              onCancel={closeModal}
            />
          </>
        )}
      </Modal>
    </div>
  );
}
