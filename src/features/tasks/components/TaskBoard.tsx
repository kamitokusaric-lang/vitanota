// タスクカンバンボード全体
// 4 カテゴリ (クラス業務/教科業務/イベント業務/事務業務 + 拡張) を横に並べる
// 絞込・新規/編集モーダルはこのコンポーネントで管理
// デフォルトは「自分」(= scope='mine'、assignee + requester 両方を含む)
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { Modal } from '@/shared/components/Modal';
import { useToast } from '@/shared/components/Toast';
import { useTasks, type TaskWithAssignees } from '../hooks/useTasks';
import { useTaskCategories } from '../hooks/useTaskCategories';
import { useAssignees } from '../hooks/useAssignees';
import { type PeriodValue } from './PeriodFilter';
import { getToday } from '../lib/periodCalc';
import { TaskMatrix, type MatrixGroup } from './TaskMatrix';
import { useTaskTags } from '../hooks/useTaskTags';
import { TaskForm, toFormInitial, type TaskFormValues } from './TaskForm';
import { TaskCommentSection } from './TaskCommentSection';

// 新規作成 modal は廃止 (chimo 2026-05-13、Dashboard 上部 TaskCreateTabs に移管)
// 編集モーダルは TaskEditModal に集約 (chimo 2026-05-30、 calendar 経由でも共有)。

// Phase 7 (chimo 2026-05-30): フィルタ state は TasksTabWithCalendar に上げて
// board / week / month で共有する。 TaskBoard はそれを props として受け取る。
// PeriodFilter (期間) は board のみ参照、 calendar 側は週/月ナビで期間制御。
export interface SharedFilters {
  filterOwner: string | undefined;
  filterTagIds: string[];
  filterCategoryIds: string[];
  showDelegated: boolean;
  period: PeriodValue;
}

interface TaskBoardProps {
  selfUserId: string;
  filters: SharedFilters;
}

export function TaskBoard({ selfUserId, filters }: TaskBoardProps) {
  // Phase 7: フィルタ state は親 (TasksTabWithCalendar) で管理、 props で受け取る。
  // filterOwner === selfUserId → scope='mine' / undefined → 全員 / 他 → ownerUserId 指定
  const { filterOwner, filterTagIds, filterCategoryIds, showDelegated, period } =
    filters;
  const [editTask, setEditTask] = useState<TaskWithAssignees | null>(null);
  const { showToast } = useToast();

  // useTasks に渡す dateFilter: default mode は「今日以降 + 期限なし + 期限切れ未完了」
  // 内部的には range の上限を遠未来に倒すことで API 側 default ロジックを流用している
  const dateFilter = useMemo(() => {
    if (period.mode === 'default') {
      return {
        mode: 'default' as const,
        weekStart: getToday(),
        weekEnd: '2099-12-31',
      };
    }
    return period;
  }, [period]);

  const taskQueryOptions =
    filterOwner === selfUserId
      ? ({ scope: 'mine', dateFilter } as const)
      : filterOwner
        ? { ownerUserId: filterOwner, dateFilter }
        : { dateFilter };
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
  // 縦軸 grouping 廃止に伴い、 各カード上端にカテゴリ chip を出すための name 解決用 Map
  // (hook 呼び出しは early return より前に置く必要があるためここで定義)
  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories ?? []) m.set(c.id, c.name);
    return m;
  }, [categories]);

  // 旧 handleBulkCreate (新規一括作成) は ManualTaskCreateForm に移管済 (chimo 2026-05-13)
  // 旧 handleUpdate / handleDelete / handleDuplicate / handleCreateTag は TaskEditModal に集約
  // (chimo 2026-05-30、 calendar 経由でも共有)。

  // 横方向ドラッグ&ドロップで status 変更
  const handleDropStatus = async (
    taskId: string,
    newStatus: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done',
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

  // フィルタ適用後のタスク (タグ/カテゴリは OR 条件)
  // - カテゴリフィルタ: 選択カテゴリのいずれかに属するタスクのみ
  // - タグフィルタ: 選択タグのいずれかを持つタスクのみ
  // - 「自分」フィルタ時に showDelegated=false なら自分が依頼済 (createdBy=self, owner!=self) を除外
  const categoryFilterSet = new Set(filterCategoryIds);
  const tagFilterSet = new Set(filterTagIds);
  const filteredTasks = tasks.filter((t) => {
    if (categoryFilterSet.size > 0 && !categoryFilterSet.has(t.categoryId)) return false;
    if (tagFilterSet.size > 0 && !t.tags.some((tg) => tagFilterSet.has(tg.id))) return false;
    if (filterOwner === selfUserId && !showDelegated) {
      // delegated = 自分が依頼したが assignees に自分が含まれない (= お願いした側)
      const isMine = t.assignees.some((a) => a.userId === selfUserId);
      if (t.createdBy === selfUserId && !isMine) return false;
    }
    return true;
  });

  // 縦軸の「カテゴリ別 grouping」 は廃止 (chimo 2026-05-20)。
  // タスクは 1 つの 5 列 grid (status 別) に統合表示。
  // カテゴリ filter は task の絞り込み条件としてのみ作用する (rows 構造には影響しない)。
  const rows: MatrixGroup[] = [{ id: 'all', label: '' }];
  const assignTaskToRows = (_t: TaskWithAssignees): string[] => ['all'];

  return (
    <div data-testid="task-board">
      {/* Linear 風 filter row: chip 4 つを左寄せ + 右端に新規ボタン
          chimo 2026-05-20: 高さ 34px / 14px / pill、 wrap 下余白 28px */}
      {/* Phase 7: filter UI は親 (TasksTabWithCalendar) に上げて board / week / month で共有 */}
      <TaskMatrix
        tasks={filteredTasks}
        rows={rows}
        assignTaskToRows={assignTaskToRows}
        selfUserId={selfUserId}
        onEdit={setEditTask}
        onTaskDropStatus={handleDropStatus}
        // 「全員」フィルタ時のみ自分のタスクを薄い黄色 + カード左の赤ラインでハイライト
        highlightMineTasks={filterOwner === undefined}
        categoryNameById={categoryNameById}
      />

      <TaskEditModal
        task={editTask}
        selfUserId={selfUserId}
        onClose={() => setEditTask(null)}
      />
    </div>
  );
}

// 編集モーダル右上の 3 点リーダーメニュー (複製 / 削除)
// Phase 6 (chimo 2026-05-30): カレンダー経由の編集モーダルでも同じ動線を出すため
// export 化、 TasksTabWithCalendar からも import 可能に。
export function TaskEditKebabMenu({
  onDuplicate,
  onDelete,
}: {
  onDuplicate: () => void;
  onDelete: () => void;
}) {
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
        <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDuplicate();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            data-testid="task-edit-menu-duplicate"
          >
            タスクを複製
          </button>
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

// 編集モーダル本体 (Phase 6 で TaskBoard 内から共通化、 chimo 2026-05-30)。
// edit + duplicate + delete + コメント + KebabMenu + readonly 判定をまとめて持つ。
// TaskBoard と TasksTabWithCalendar (calendar 経由) 両方が import して使う。
// `topSlot` で各呼び出し元固有の追加 button (例: calendar の「来週に渡す」) を挿入できる。
export function TaskEditModal({
  task,
  selfUserId,
  onClose,
  topSlot,
}: {
  task: TaskWithAssignees | null;
  selfUserId: string;
  onClose: () => void;
  topSlot?: (task: TaskWithAssignees) => React.ReactNode;
}) {
  const { mutate: globalMutate } = useSWRConfig();
  const { showToast } = useToast();
  const { categories } = useTaskCategories();
  const { assignees } = useAssignees();
  const { tags: taskTags, createTag } = useTaskTags();
  const [duplicateSource, setDuplicateSource] =
    useState<TaskWithAssignees | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const close = () => {
    setDuplicateSource(null);
    setFormError(null);
    onClose();
  };

  const invalidateTasks = () =>
    globalMutate(
      (key: unknown) =>
        typeof key === 'string' && key.startsWith('/api/tasks'),
    );

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
      await fetch(`/api/tasks/${taskId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds: values.tagIds }),
      });
      await invalidateTasks();
      close();
      showToast('タスクを更新しました', 'success');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (taskId: string) => {
    if (typeof window !== 'undefined' && !window.confirm('このタスクを削除しますか?')) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (!res.ok) {
        showToast('削除に失敗しました', 'error');
        return;
      }
      await invalidateTasks();
      close();
      showToast('タスクを削除しました', 'success');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDuplicate = async (
    sourceTaskId: string,
    values: TaskFormValues,
  ) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/tasks/${sourceTaskId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assigneeUserIds: values.assigneeUserIds,
          categoryId: values.categoryId,
          title: values.title,
          description: values.description || null,
          dueDate: values.dueDate || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        setFormError(body.message ?? 'タスクの複製に失敗しました');
        return;
      }
      const { task: created } = (await res.json()) as { task: { id: string } };
      if (values.tagIds.length > 0) {
        await fetch(`/api/tasks/${created.id}/tags`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tagIds: values.tagIds }),
        });
      }
      await invalidateTasks();
      close();
      const assigneesLabel = (() => {
        if (values.assigneeUserIds.length === 0) return '誰か';
        const names = values.assigneeUserIds.map((uid) => {
          if (uid === selfUserId) return '自分';
          const a = (assignees ?? []).find((x) => x.userId === uid);
          return a?.name ?? '他の先生';
        });
        if (names.length <= 3) return names.join(', ');
        return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
      })();
      showToast(
        `${assigneesLabel}のタスクとして「${values.title}」を複製しました`,
        'success',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isSelfAssignee = !!task && task.assignees.some((a) => a.userId === selfUserId);

  return (
    <>
      <Modal
        open={!!task && !duplicateSource}
        onClose={close}
        title={
          task ? (
            <div className="flex items-center justify-between">
              <span>{isSelfAssignee ? 'タスクの編集' : 'タスクを見る'}</span>
              {isSelfAssignee && (
                <TaskEditKebabMenu
                  onDuplicate={() => setDuplicateSource(task)}
                  onDelete={() => handleDelete(task.id)}
                />
              )}
            </div>
          ) : undefined
        }
        maxWidth="max-w-xl"
      >
        {task && (
          <>
            {topSlot?.(task)}
            <TaskForm
              mode="edit"
              initial={toFormInitial(task)}
              categories={categories ?? []}
              assignees={assignees ?? []}
              canAssignToOthers
              selfUserId={selfUserId}
              submitting={submitting}
              error={formError}
              readonly={!isSelfAssignee}
              taskTags={taskTags ?? []}
              onCreateTag={createTag}
              onSubmit={(values) => handleUpdate(task.id, values)}
              onCancel={close}
            />
            <TaskCommentSection
              taskId={task.id}
              selfUserId={selfUserId}
              canDeleteAny={false}
            />
          </>
        )}
      </Modal>
      <Modal
        open={!!duplicateSource}
        onClose={close}
        title="タスクを複製"
        maxWidth="max-w-lg"
      >
        {duplicateSource && (
          <>
            <p
              className="mb-3 text-xs text-gray-600"
              data-testid="task-duplicate-source"
            >
              元タスク「{duplicateSource.title}」をコピーします。担当者を選択してください。
            </p>
            <TaskForm
              mode="duplicate"
              initial={{
                ...toFormInitial(duplicateSource),
                assigneeUserIds: [],
              }}
              categories={categories ?? []}
              assignees={assignees ?? []}
              canAssignToOthers
              selfUserId={selfUserId}
              submitting={submitting}
              error={formError}
              taskTags={taskTags ?? []}
              onCreateTag={createTag}
              onSubmit={(values) => handleDuplicate(duplicateSource.id, values)}
              onCancel={close}
            />
          </>
        )}
      </Modal>
    </>
  );
}
