// 新規タスク 一括作成フォーム (横長モーダル)
// ユースケース: 教頭先生が「運動会」タグを作り、紐づくタスクを複数列挙して一気に登録、各行で担当者を振り分ける。
//
// 上段: カテゴリ + タグ (全行共通)
// 下段: 各行 (タイトル / 説明 / 期限 / 担当者 / コメント + × 削除) を横並びで複数追加
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { TagPicker, type TagPickerHandle } from '@/shared/components/TagPicker';
import type { TaskCategory } from '@/db/schema';
import type { Assignee } from '../hooks/useAssignees';
import type { TaskTag } from '../hooks/useTaskTags';
import { AssigneePopoverInput } from './AssigneePopoverInput';

export interface BulkRowValues {
  title: string;
  description: string;
  dueDate: string; // YYYY-MM-DD or ''
  assigneeUserIds: string[];
  initialComment: string;
}

export interface BulkCreateValues {
  categoryId: string;
  tagIds: string[];
  rows: BulkRowValues[];
}

interface BulkCreateFormProps {
  categories: TaskCategory[];
  assignees: Assignee[];
  selfUserId: string;
  taskTags: TaskTag[];
  submitting: boolean;
  error?: string | null;
  onCreateTag: (name: string) => Promise<TaskTag | null>;
  onSubmit: (values: BulkCreateValues) => void;
  onCancel: () => void;
}

function emptyRow(selfUserId: string): BulkRowValues {
  return {
    title: '',
    description: '',
    dueDate: '',
    assigneeUserIds: [selfUserId],
    initialComment: '',
  };
}

export function TaskBulkCreateForm({
  categories,
  assignees,
  selfUserId,
  taskTags,
  submitting,
  error,
  onCreateTag,
  onSubmit,
  onCancel,
}: BulkCreateFormProps) {
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? '');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [rows, setRows] = useState<BulkRowValues[]>([emptyRow(selfUserId)]);

  const assigneeCandidates = useMemo(
    () => [
      { userId: selfUserId, label: '自分' },
      ...assignees
        .filter((a) => a.userId !== selfUserId)
        .map((a) => ({ userId: a.userId, label: a.name ?? a.email })),
    ],
    [assignees, selfUserId],
  );

  const tagPickerRef = useRef<TagPickerHandle>(null);

  function toggleTag(tagId: string) {
    setTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  }

  function updateRow(idx: number, patch: Partial<BulkRowValues>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(selfUserId)]);
  }

  function removeRow(idx: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  function toggleRowAssignee(idx: number, userId: string) {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        return r.assigneeUserIds.includes(userId)
          ? { ...r, assigneeUserIds: r.assigneeUserIds.filter((id) => id !== userId) }
          : { ...r, assigneeUserIds: [...r.assigneeUserIds, userId] };
      }),
    );
  }

  // 担当者 0 名の行は無効。タイトルが空でも無効。
  const isValidRow = (r: BulkRowValues) =>
    r.title.trim().length > 0 && r.assigneeUserIds.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validRows = rows.filter(isValidRow);
    if (validRows.length === 0) return;
    // TagPicker の input に保留中の文字があれば、submit 直前に作成 + 紐付け
    // (= 「作成」ボタンを押し忘れた場合の救済)
    let finalTagIds = tagIds;
    if (tagPickerRef.current) {
      const flushed = await tagPickerRef.current.flushPending();
      if (flushed && !finalTagIds.includes(flushed.id)) {
        finalTagIds = [...finalTagIds, flushed.id];
      }
    }
    onSubmit({ categoryId, tagIds: finalTagIds, rows: validRows });
  }

  const validRowCount = rows.filter(isValidRow).length;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="task-bulk-create-form">
      {error && <ErrorMessage message={error} />}

      {/* 上段: カテゴリ → タグ (縦並び、全行共通) */}
      <div className="space-y-3 rounded-md border border-vn-border bg-gray-50 p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            カテゴリ (全行共通)
          </label>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const active = categoryId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={`inline-flex rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-vn-accent text-white'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                  data-testid={`bulk-form-category-${c.id}`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
        <TagPicker
          ref={tagPickerRef}
          selectedTagIds={tagIds}
          onToggle={toggleTag}
          availableTags={taskTags}
          onCreateTag={onCreateTag}
          testIdPrefix="bulk-form"
          label="タグ (任意)"
          inputPlaceholder="新規タグ名 or 既存タグから選択 (例: 運動会)"
        />
      </div>

      {/* 下段: 各行 (横並び) */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="bulk-form-rows">
          <thead className="text-[11px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-2 py-1 text-left">タイトル *</th>
              <th className="px-2 py-1 text-left">説明</th>
              <th className="px-2 py-1 text-left whitespace-nowrap">期限</th>
              <th className="px-2 py-1 text-left whitespace-nowrap">担当者 (最大 3 名)</th>
              <th className="px-2 py-1 text-left">コメント</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, idx) => (
              <tr key={idx} data-testid={`bulk-form-row-${idx}`}>
                <td className="px-1 py-1 align-top">
                  <input
                    type="text"
                    value={row.title}
                    onChange={(e) => updateRow(idx, { title: e.target.value })}
                    placeholder="例: 児童席の配置"
                    maxLength={15}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                    data-testid={`bulk-form-row-${idx}-title`}
                  />
                </td>
                <td className="px-1 py-1 align-top">
                  <input
                    type="text"
                    value={row.description}
                    onChange={(e) => updateRow(idx, { description: e.target.value })}
                    maxLength={2000}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                    data-testid={`bulk-form-row-${idx}-description`}
                  />
                </td>
                <td className="px-1 py-1 align-top whitespace-nowrap">
                  <input
                    type="date"
                    value={row.dueDate}
                    onChange={(e) => updateRow(idx, { dueDate: e.target.value })}
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                    data-testid={`bulk-form-row-${idx}-due-date`}
                  />
                </td>
                <td className="px-1 py-1 align-top">
                  <AssigneePopoverInput
                    candidates={assigneeCandidates}
                    selectedUserIds={row.assigneeUserIds}
                    onToggle={(userId) => toggleRowAssignee(idx, userId)}
                    invalid={row.assigneeUserIds.length === 0}
                    maxSelected={3}
                    testIdPrefix={`bulk-form-row-${idx}-assignees`}
                  />
                </td>
                <td className="px-1 py-1 align-top">
                  <input
                    type="text"
                    value={row.initialComment}
                    onChange={(e) => updateRow(idx, { initialComment: e.target.value })}
                    maxLength={2000}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                    data-testid={`bulk-form-row-${idx}-comment`}
                  />
                </td>
                <td className="px-1 py-1 align-top">
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    disabled={rows.length === 1}
                    className="rounded px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
                    data-testid={`bulk-form-row-${idx}-remove`}
                    aria-label="この行を削除"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">
          有効な行: {validRowCount} / {rows.length}
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={addRow}
          className="text-xs"
          data-testid="bulk-form-add-row"
        >
          + 行を追加
        </Button>
      </div>

      <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
        <Button
          variant="secondary"
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="text-xs"
        >
          キャンセル
        </Button>
        <Button
          type="submit"
          isLoading={submitting}
          disabled={validRowCount === 0}
          className="text-xs"
          data-testid="bulk-form-submit"
        >
          {validRowCount} 件を一括作成
        </Button>
      </div>
    </form>
  );
}
