// タスク新規・編集フォーム (モーダル内で使用)
// 担当者は M:N、自分 chip + 他教員 chip の multi-select で 1 名以上必須
// teacher は担当者フィールド非表示 (自分固定)、school_admin は複数選択可
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import type { TaskCategory } from '@/db/schema';
import type { Assignee } from '../hooks/useAssignees';
import type { TaskWithAssignees } from '../hooks/useTasks';
import type { TaskTag } from '../hooks/useTaskTags';
import { AssigneePopoverInput } from './AssigneePopoverInput';

export interface TaskFormValues {
  categoryId: string;
  assigneeUserIds: string[];
  title: string;
  description: string;
  dueDate: string; // YYYY-MM-DD or ''
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
  initialComment: string; // create 時のみ使用、初回コメントとして追加される
  tagIds: string[]; // 選択中のタグ id (タグ別表示・フィルタ用)
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
  // タグ機能 (5/7 説明会向け拡張): 利用可能タグ + 作成 callback
  taskTags?: TaskTag[];
  onCreateTag?: (name: string) => Promise<TaskTag | null>;
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
  taskTags,
  onCreateTag,
  onSubmit,
  onCancel,
  onDelete,
}: TaskFormProps) {
  const [values, setValues] = useState<TaskFormValues>({
    categoryId: initial?.categoryId ?? categories[0]?.id ?? '',
    // 複製モードは明示選択させる方針 (空配列で開く)。それ以外は initial があればそれ、なければ自分。
    assigneeUserIds:
      initial?.assigneeUserIds ?? (mode === 'duplicate' ? [] : [selfUserId]),
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    dueDate: initial?.dueDate ?? '',
    status: initial?.status ?? 'todo',
    initialComment: '',
    tagIds: initial?.tagIds ?? [],
  });

  function toggleAssignee(userId: string) {
    setValues((v) =>
      v.assigneeUserIds.includes(userId)
        ? { ...v, assigneeUserIds: v.assigneeUserIds.filter((id) => id !== userId) }
        : { ...v, assigneeUserIds: [...v.assigneeUserIds, userId] },
    );
  }

  const assigneeCandidates = useMemo(
    () => [
      { userId: selfUserId, label: '自分' },
      ...assignees
        .filter((a) => a.userId !== selfUserId)
        .map((a) => ({ userId: a.userId, label: a.name ?? a.email })),
    ],
    [assignees, selfUserId],
  );
  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);
  const [tagCreateError, setTagCreateError] = useState<string | null>(null);

  function toggleTag(tagId: string) {
    setValues((v) =>
      v.tagIds.includes(tagId)
        ? { ...v, tagIds: v.tagIds.filter((id) => id !== tagId) }
        : { ...v, tagIds: [...v.tagIds, tagId] },
    );
  }

  async function handleCreateOrToggleTag() {
    if (!onCreateTag) return;
    const name = newTagName.trim();
    if (!name) return;
    // 既存タグ名と完全一致なら新規作成せず toggle (重複作成防止)
    const existing = (taskTags ?? []).find((t) => t.name === name);
    if (existing) {
      if (!values.tagIds.includes(existing.id)) {
        setValues((v) => ({ ...v, tagIds: [...v.tagIds, existing.id] }));
      }
      setNewTagName('');
      return;
    }
    setCreatingTag(true);
    setTagCreateError(null);
    try {
      const created = await onCreateTag(name);
      if (created) {
        setValues((v) => ({ ...v, tagIds: [...v.tagIds, created.id] }));
        setNewTagName('');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'タグ作成に失敗しました';
      setTagCreateError(message);
    } finally {
      setCreatingTag(false);
    }
  }

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

  // タグ表示用 (selected を強調 + よく使われる top 10)
  const top10Tags = (taskTags ?? [])
    .slice()
    .sort((a, b) => b.assignmentCount - a.assignmentCount)
    .slice(0, 10);
  const selectedTagObjects = (taskTags ?? []).filter((t) =>
    values.tagIds.includes(t.id),
  );
  const popularUnselectedTags = top10Tags.filter(
    (t) => !values.tagIds.includes(t.id),
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="task-form">
      {error && <ErrorMessage message={error} />}

      {/* 上段: カテゴリ → タグ (新規作成モーダルと同じレイアウト) */}
      <div className="space-y-3 rounded-md border border-vn-border bg-gray-50 p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            カテゴリ
          </label>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const active = values.categoryId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={readonly}
                  onClick={() => setValues((v) => ({ ...v, categoryId: c.id }))}
                  className={`inline-flex rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-vn-accent text-white'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  } disabled:opacity-50`}
                  data-testid={`task-form-category-${c.id}`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        {taskTags !== undefined && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              タグ (任意)
            </label>
            {/* 選択中のタグ (強調表示) */}
            {selectedTagObjects.length > 0 && (
              <div className="mb-2">
                <div className="mb-1 text-[11px] text-gray-500">選択中:</div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedTagObjects.map((tg) => (
                    <button
                      key={tg.id}
                      type="button"
                      disabled={readonly}
                      onClick={() => toggleTag(tg.id)}
                      className="inline-flex items-center gap-1 rounded-full bg-purple-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                      data-testid={`task-form-tag-selected-${tg.id}`}
                    >
                      #{tg.name}
                      {!readonly && <span className="text-purple-200">×</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* よく使われるタグ (未選択分のみ) */}
            {popularUnselectedTags.length > 0 && (
              <div className="mb-2">
                <div className="mb-1 text-[11px] text-gray-500">よく使われる:</div>
                <div className="flex flex-wrap gap-1.5">
                  {popularUnselectedTags.map((tg) => (
                    <button
                      key={tg.id}
                      type="button"
                      disabled={readonly}
                      onClick={() => toggleTag(tg.id)}
                      className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 hover:bg-purple-200 disabled:opacity-50"
                      data-testid={`task-form-tag-${tg.id}`}
                    >
                      #{tg.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!readonly && onCreateTag && (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="新規タグ名 or 既存タグから選択 (例: 運動会)"
                    maxLength={100}
                    className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-xs"
                    data-testid="task-form-new-tag-name"
                    disabled={creatingTag}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleCreateOrToggleTag}
                    isLoading={creatingTag}
                    disabled={!newTagName.trim()}
                    className="text-xs"
                    data-testid="task-form-new-tag-create"
                  >
                    {(taskTags ?? []).find((t) => t.name === newTagName.trim())
                      ? '追加'
                      : '作成'}
                  </Button>
                </div>
                {(() => {
                  const q = newTagName.trim();
                  if (!q) return null;
                  const suggestions = (taskTags ?? []).filter(
                    (t) =>
                      t.name !== q &&
                      t.name.includes(q) &&
                      !values.tagIds.includes(t.id),
                  );
                  if (suggestions.length === 0) return null;
                  return (
                    <div
                      className="mt-1 flex flex-wrap items-center gap-1 text-xs"
                      data-testid="task-form-tag-suggestions"
                    >
                      <span className="text-gray-500">もしかして:</span>
                      {suggestions.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setValues((v) => ({
                              ...v,
                              tagIds: [...v.tagIds, t.id],
                            }));
                            setNewTagName('');
                          }}
                          className="rounded-full bg-purple-100 px-2 py-0.5 font-medium text-purple-700 hover:bg-purple-200"
                        >
                          #{t.name}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </>
            )}
            {tagCreateError && (
              <div className="mt-1 text-xs text-red-600">{tagCreateError}</div>
            )}
          </div>
        )}
      </div>

      {/* 下段: タイトル / 説明 / 期限 / 担当者 / ステータス */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          タイトル
        </label>
        <input
          type="text"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          maxLength={15}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-600"
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
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-600"
          data-testid="task-form-description"
          disabled={readonly}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            期限 (任意)
          </label>
          <input
            type="date"
            value={values.dueDate}
            onChange={(e) => setValues((v) => ({ ...v, dueDate: e.target.value }))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-600"
            data-testid="task-form-due-date"
            disabled={readonly}
          />
        </div>

        {canAssignToOthers && (
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-700">
              担当者 (1 名以上、最大 3 名)
            </label>
            <AssigneePopoverInput
              candidates={assigneeCandidates}
              selectedUserIds={values.assigneeUserIds}
              onToggle={toggleAssignee}
              disabled={readonly}
              invalid={values.assigneeUserIds.length === 0}
              maxSelected={3}
              testIdPrefix="task-form-assignees"
            />
            {values.assigneeUserIds.length === 0 && (
              <div className="mt-1 text-xs text-red-600">
                担当者を 1 名以上選択してください
              </div>
            )}
          </div>
        )}

        {mode === 'edit' && (
          <div>
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
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-600"
              data-testid="task-form-status"
              disabled={readonly}
            >
              <option value="backlog">未着手 (Backlog)</option>
              <option value="todo">今週やる (ToDo)</option>
              <option value="in_progress">進行中 (Doing)</option>
              <option value="review">確認・調整中 (Review)</option>
              <option value="done">完了 (Done)</option>
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
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-600"
            data-testid="task-form-initial-comment"
          />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button
          variant="secondary"
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="text-xs"
        >
          閉じる
        </Button>
        {!readonly && (
          <Button
            type="submit"
            disabled={
              submitting ||
              !values.title.trim() ||
              values.assigneeUserIds.length === 0
            }
            className="text-xs"
            data-testid="task-form-submit"
          >
            {mode === 'create' ? '作成' : mode === 'duplicate' ? '複製' : '保存'}
          </Button>
        )}
      </div>
    </form>
  );
}

export function toFormInitial(task: TaskWithAssignees): Partial<TaskFormValues> {
  return {
    categoryId: task.categoryId,
    assigneeUserIds: task.assignees.map((a) => a.userId),
    title: task.title,
    description: task.description ?? '',
    dueDate: dueDateToInputValue(task.dueDate),
    status: task.status,
    tagIds: task.tags.map((t) => t.id),
  };
}
