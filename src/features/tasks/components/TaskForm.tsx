// タスク新規・編集フォーム (モーダル内で使用)
// teacher は担当者フィールド非表示 (自分固定)、school_admin は選択可
import { useState, useEffect } from 'react';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import type { TaskCategory } from '@/db/schema';
import type { Assignee } from '../hooks/useAssignees';
import type { TaskWithOwner } from '../hooks/useTasks';

export interface TaskFormValues {
  categoryId: string;
  ownerUserId: string;
  title: string;
  description: string;
  dueDate: string; // YYYY-MM-DD or ''
  status: 'todo' | 'in_progress' | 'done';
  initialComment: string; // create 時のみ使用、初回コメントとして追加される
}

interface TaskFormProps {
  mode: 'create' | 'edit' | 'duplicate';
  initial?: Partial<TaskFormValues>;
  categories: TaskCategory[];
  assignees: Assignee[];
  canAssignToOthers: boolean;
  selfUserId: string;
  submitting: boolean;
  error?: string | null;
  // readonly=true: 他人のタスクを閲覧するモード。全フィールド disabled、
  // 保存・削除ボタン非表示、キャンセルは「閉じる」として機能する
  readonly?: boolean;
  onSubmit: (values: TaskFormValues) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

function dueDateToInputValue(v: string | Date | null | undefined): string {
  if (!v) return '';
  const d = typeof v === 'string' ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function TaskForm({
  mode,
  initial,
  categories,
  assignees,
  canAssignToOthers,
  selfUserId,
  submitting,
  error,
  readonly = false,
  onSubmit,
  onCancel,
  onDelete,
}: TaskFormProps) {
  const [values, setValues] = useState<TaskFormValues>({
    categoryId: initial?.categoryId ?? categories[0]?.id ?? '',
    ownerUserId: initial?.ownerUserId ?? selfUserId,
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    dueDate: initial?.dueDate ?? '',
    status: initial?.status ?? 'todo',
    initialComment: '',
  });

  useEffect(() => {
    if (!values.categoryId && categories.length > 0) {
      setValues((v) => ({ ...v, categoryId: categories[0].id }));
    }
  }, [categories, values.categoryId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.title.trim()) return;
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-testid="task-form">
      {error && <ErrorMessage message={error} />}

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          カテゴリ
        </label>
        <select
          value={values.categoryId}
          onChange={(e) => setValues((v) => ({ ...v, categoryId: e.target.value }))}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-600"
          data-testid="task-form-category"
          required
          disabled={readonly}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          タイトル
        </label>
        <input
          type="text"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          maxLength={200}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-600"
          data-testid="task-form-title"
          required
          disabled={readonly}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          説明 (任意)
        </label>
        <textarea
          value={values.description}
          onChange={(e) =>
            setValues((v) => ({ ...v, description: e.target.value }))
          }
          rows={3}
          maxLength={2000}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-600"
          data-testid="task-form-description"
          disabled={readonly}
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-700">
            期限 (任意)
          </label>
          <input
            type="date"
            value={values.dueDate}
            onChange={(e) => setValues((v) => ({ ...v, dueDate: e.target.value }))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-600"
            data-testid="task-form-due-date"
            disabled={readonly}
          />
        </div>

        {mode === 'edit' && (
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-700">
              ステータス
            </label>
            <select
              value={values.status}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  status: e.target.value as TaskFormValues['status'],
                }))
              }
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-600"
              data-testid="task-form-status"
              disabled={readonly}
            >
              <option value="todo">未着手</option>
              <option value="in_progress">進行中</option>
              <option value="done">完了</option>
            </select>
          </div>
        )}
      </div>

      {mode === 'create' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            コメント (任意、初回コメントとして添えられます)
          </label>
          <textarea
            value={values.initialComment}
            onChange={(e) =>
              setValues((v) => ({ ...v, initialComment: e.target.value }))
            }
            rows={2}
            maxLength={2000}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-600"
            data-testid="task-form-initial-comment"
          />
        </div>
      )}

      {canAssignToOthers && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            担当者
          </label>
          <select
            value={values.ownerUserId}
            onChange={(e) =>
              setValues((v) => ({ ...v, ownerUserId: e.target.value }))
            }
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-600"
            data-testid="task-form-owner"
            required
            disabled={readonly}
          >
            {mode === 'duplicate' && (
              <option value="">-- 担当者を選択 --</option>
            )}
            <option value={selfUserId}>自分</option>
            {assignees
              .filter((a) => a.userId !== selfUserId)
              .map((a) => (
                <option key={a.userId} value={a.userId}>
                  {a.name ?? a.email}
                </option>
              ))}
          </select>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2">
        <div>
          {mode === 'edit' && onDelete && !readonly && (
            <Button
              variant="danger"
              type="button"
              onClick={onDelete}
              className="text-xs"
              disabled={submitting}
              data-testid="task-form-delete"
            >
              削除
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="text-xs"
          >
            {readonly ? '閉じる' : 'キャンセル'}
          </Button>
          {!readonly && (
            <Button
              type="submit"
              disabled={
                submitting ||
                !values.title.trim() ||
                (mode === 'duplicate' && !values.ownerUserId)
              }
              className="text-xs"
              data-testid="task-form-submit"
            >
              {mode === 'create' ? '作成' : mode === 'duplicate' ? '複製' : '保存'}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

export function toFormInitial(task: TaskWithOwner): Partial<TaskFormValues> {
  return {
    categoryId: task.categoryId,
    ownerUserId: task.ownerUserId,
    title: task.title,
    description: task.description ?? '',
    dueDate: dueDateToInputValue(task.dueDate),
    status: task.status,
  };
}
