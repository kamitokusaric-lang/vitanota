// 新規タスク 一括作成フォーム (横長モーダル)
// ユースケース: 教頭先生が「運動会」タグを作り、紐づくタスクを複数列挙して一気に登録、各行で担当者を振り分ける。
//
// 上段: カテゴリ + タグ (全行共通)
// 下段: 各行 (タイトル / 説明 / 期限 / 担当者 / コメント + × 削除) を横並びで複数追加
import { useState } from 'react';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import type { TaskCategory } from '@/db/schema';
import type { Assignee } from '../hooks/useAssignees';
import type { TaskTag } from '../hooks/useTaskTags';

export interface BulkRowValues {
  title: string;
  description: string;
  dueDate: string; // YYYY-MM-DD or ''
  ownerUserId: string;
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
    ownerUserId: selfUserId,
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

  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);
  const [tagCreateError, setTagCreateError] = useState<string | null>(null);

  function toggleTag(tagId: string) {
    setTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  }

  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name) return;
    setCreatingTag(true);
    setTagCreateError(null);
    try {
      const created = await onCreateTag(name);
      if (created) {
        setTagIds((prev) => [...prev, created.id]);
        setNewTagName('');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'タグ作成に失敗しました';
      setTagCreateError(message);
    } finally {
      setCreatingTag(false);
    }
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validRows = rows.filter((r) => r.title.trim().length > 0);
    if (validRows.length === 0) return;
    onSubmit({ categoryId, tagIds, rows: validRows });
  }

  const validRowCount = rows.filter((r) => r.title.trim().length > 0).length;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="task-bulk-create-form">
      {error && <ErrorMessage message={error} />}

      {/* 上段: カテゴリ + タグ (全行共通) */}
      <div className="grid grid-cols-1 gap-4 rounded-md border border-vn-border bg-gray-50 p-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            カテゴリ (全行共通)
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
            data-testid="bulk-form-category"
            required
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
            タグ (全行共通、複数選択可)
          </label>
          {taskTags.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {taskTags.map((tg) => {
                const active = tagIds.includes(tg.id);
                return (
                  <button
                    key={tg.id}
                    type="button"
                    onClick={() => toggleTag(tg.id)}
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-purple-600 text-white'
                        : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                    }`}
                    data-testid={`bulk-form-tag-${tg.id}`}
                  >
                    #{tg.name}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateTag();
                }
              }}
              placeholder="新しいタグ名 (例: 運動会)"
              maxLength={100}
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
              data-testid="bulk-form-new-tag-name"
              disabled={creatingTag}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handleCreateTag}
              isLoading={creatingTag}
              disabled={!newTagName.trim()}
              className="text-xs"
              data-testid="bulk-form-new-tag-create"
            >
              作成
            </Button>
          </div>
          {tagCreateError && (
            <div className="mt-1 text-xs text-red-600">{tagCreateError}</div>
          )}
        </div>
      </div>

      {/* 下段: 各行 (横並び) */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="bulk-form-rows">
          <thead className="text-[11px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-2 py-1 text-left">タイトル *</th>
              <th className="px-2 py-1 text-left">説明</th>
              <th className="px-2 py-1 text-left whitespace-nowrap">期限</th>
              <th className="px-2 py-1 text-left whitespace-nowrap">担当者</th>
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
                    maxLength={200}
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
                <td className="px-1 py-1 align-top whitespace-nowrap">
                  <select
                    value={row.ownerUserId}
                    onChange={(e) => updateRow(idx, { ownerUserId: e.target.value })}
                    className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                    data-testid={`bulk-form-row-${idx}-owner`}
                  >
                    <option value={selfUserId}>自分</option>
                    {assignees
                      .filter((a) => a.userId !== selfUserId)
                      .map((a) => (
                        <option key={a.userId} value={a.userId}>
                          {a.name ?? a.email}
                        </option>
                      ))}
                  </select>
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
        <Button
          type="button"
          variant="secondary"
          onClick={addRow}
          className="text-xs"
          data-testid="bulk-form-add-row"
        >
          + 行を追加
        </Button>
        <div className="text-xs text-gray-500">
          有効な行: {validRowCount} / {rows.length}
        </div>
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
