// 手動でタスクを追加するフォーム。AI 整理の review view と同じ行スタイルで、
// 各行ごとにカテゴリ / 期限 / タグ / 担当者 / メモを設定できる。
// + 行追加で空行を追加、× で個別削除、一括作成ボタンで POST /api/tasks。
//
// 旧 TaskBulkCreateForm (上部にセッション共通カテゴリ・タグ + 表形式) は廃止し、
// 本 component に統合 (chimo 設計 2026-05-13)。

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useSWRConfig } from 'swr';
import { useTaskCategories } from '@/features/tasks/hooks/useTaskCategories';
import { useAssignees } from '@/features/tasks/hooks/useAssignees';
import { useTaskTags, type TaskTag } from '@/features/tasks/hooks/useTaskTags';
import {
  AssigneePopoverInput,
  type AssigneeCandidate,
} from '@/features/tasks/components/AssigneePopoverInput';

type ParentCategoryName =
  | '学び'
  | '育み'
  | '安心'
  | '1学年'
  | '2学年'
  | '3学年'
  | '特別支援学級'
  | '校務';

const PARENT_OPTIONS: ParentCategoryName[] = [
  '学び',
  '育み',
  '安心',
  '1学年',
  '2学年',
  '3学年',
  '特別支援学級',
  '校務',
];

// DB のカテゴリ名 (全角「１学年」等) と UI 半角「1学年」の差を吸収
function normalizeCategoryName(s: string): string {
  return s.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
}

interface ManualRow {
  title: string;
  userSelectedParentName: ParentCategoryName | '';
  dueDate: string;
  tagIds: string[];
  assigneeUserIds: string[];
  memo: string;
}

function emptyRow(selfUserId: string): ManualRow {
  return {
    title: '',
    userSelectedParentName: '',
    dueDate: '',
    tagIds: [],
    assigneeUserIds: [selfUserId],
    memo: '',
  };
}

export function ManualTaskCreateForm({
  selfUserId,
  initialDueDate,
  onSuccess,
}: {
  selfUserId: string;
  // Phase 6 (chimo 2026-05-29): カレンダーの日付セル「+」 から呼ぶときに
  // YYYY-MM-DD を渡して dueDate プリフィル。 dashboard 上部の TaskCreateTabs
  // 経由は渡さないので空文字列のまま (挙動不変)。
  initialDueDate?: string;
  onSuccess?: () => void;
}) {
  const [rows, setRows] = useState<ManualRow[]>(() => [
    { ...emptyRow(selfUserId), dueDate: initialDueDate ?? '' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { categories } = useTaskCategories();
  const { assignees } = useAssignees();
  const { tags: availableTags, mutate: mutateTags } = useTaskTags();
  const { mutate: globalMutate } = useSWRConfig();

  const assigneeCandidates: AssigneeCandidate[] = useMemo(
    () =>
      (assignees ?? []).map((a) => ({
        userId: a.userId,
        label: a.userId === selfUserId ? '自分' : a.name ?? a.email,
      })),
    [assignees, selfUserId],
  );

  const updateRow = (index: number, patch: Partial<ManualRow>) => {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };
  const addRow = () =>
    setRows((rs) => [...rs, emptyRow(selfUserId)]);
  const removeRow = (index: number) =>
    setRows((rs) => (rs.length <= 1 ? rs : rs.filter((_, i) => i !== index)));
  const toggleRowAssignee = (index: number, userId: string) => {
    setRows((rs) =>
      rs.map((r, i) => {
        if (i !== index) return r;
        const has = r.assigneeUserIds.includes(userId);
        if (has) {
          return {
            ...r,
            assigneeUserIds: r.assigneeUserIds.filter((id) => id !== userId),
          };
        }
        if (r.assigneeUserIds.length >= 10) return r;
        return { ...r, assigneeUserIds: [...r.assigneeUserIds, userId] };
      }),
    );
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

  const handleSubmit = async () => {
    setError(null);
    const filledRows = rows.filter((r) => r.title.trim().length > 0);
    if (filledRows.length === 0) {
      setError('タイトルを入力してください。');
      return;
    }
    const unsetCategory = filledRows.find(
      (r) => r.userSelectedParentName === '',
    );
    if (unsetCategory) {
      setError('カテゴリを選んでいない行があります。');
      return;
    }
    const unsetAssignee = filledRows.find(
      (r) => r.assigneeUserIds.length === 0,
    );
    if (unsetAssignee) {
      setError('担当者が 0 名の行があります。1 名以上選んでください。');
      return;
    }

    // テナント内 task_categories から name -> id を解決
    const nameToId = new Map(
      (categories ?? []).map((c) => [normalizeCategoryName(c.name), c.id]),
    );

    setSubmitting(true);
    try {
      let createdCount = 0;
      let failedCount = 0;
      for (const row of filledRows) {
        const categoryId = nameToId.get(
          normalizeCategoryName(row.userSelectedParentName),
        );
        if (!categoryId) {
          failedCount++;
          continue;
        }
        try {
          const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              categoryId,
              assigneeUserIds: row.assigneeUserIds,
              title: row.title.trim(),
              description: row.memo.trim() || undefined,
              dueDate: row.dueDate || undefined,
            }),
          });
          if (!res.ok) {
            failedCount++;
            continue;
          }
          const { task } = (await res.json()) as { task: { id: string } };
          if (row.tagIds.length > 0) {
            await fetch(`/api/tasks/${task.id}/tags`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tagIds: row.tagIds }),
            });
          }
          createdCount++;
        } catch {
          failedCount++;
        }
      }
      await globalMutate(
        (key) => typeof key === 'string' && key.startsWith('/api/tasks'),
        undefined,
        { revalidate: true },
      );
      if (failedCount > 0) {
        setError(`${createdCount} 件作成、${failedCount} 件失敗しました。`);
      } else {
        setRows([emptyRow(selfUserId)]);
        onSuccess?.();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <p className="mb-2 text-sm text-gray-600">
        手動で入力するタスクを 1 行ずつ作成できます。
      </p>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li
            key={i}
            data-testid={`manual-task-row-${i}`}
            className="rounded-md border border-gray-200 bg-gray-50 p-3"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={r.title}
                    placeholder="例: 児童席の配置"
                    onChange={(e) => updateRow(i, { title: e.target.value })}
                    maxLength={200}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={rows.length <= 1}
                    aria-label="この行を削除"
                    className="rounded px-1.5 py-1 text-xs text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ×
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                  <label className="flex items-center gap-1">
                    <span>カテゴリ</span>
                    <select
                      value={r.userSelectedParentName}
                      onChange={(e) =>
                        updateRow(i, {
                          userSelectedParentName: e.target
                            .value as ParentCategoryName | '',
                        })
                      }
                      className={`rounded border px-1.5 py-0.5 text-xs ${
                        r.userSelectedParentName === ''
                          ? 'border-red-400 text-red-700'
                          : 'border-gray-300'
                      }`}
                    >
                      <option value="">カテゴリを選んでください</option>
                      {PARENT_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1">
                    <span>期限</span>
                    <input
                      type="date"
                      value={r.dueDate}
                      onChange={(e) => updateRow(i, { dueDate: e.target.value })}
                      className="rounded border border-gray-300 px-1.5 py-0.5 text-xs"
                    />
                  </label>
                  <ManualRowTagInput
                    tagIds={r.tagIds}
                    availableTags={availableTags ?? []}
                    onChange={(tagIds) => updateRow(i, { tagIds })}
                    onCreateTag={handleCreateTag}
                  />
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="whitespace-nowrap">担当者</span>
                  <div className="flex-1">
                    <AssigneePopoverInput
                      candidates={assigneeCandidates}
                      selectedUserIds={r.assigneeUserIds}
                      onToggle={(userId) => toggleRowAssignee(i, userId)}
                      invalid={r.assigneeUserIds.length === 0}
                      maxSelected={10}
                      testIdPrefix={`manual-task-row-${i}-assignees`}
                    />
                  </div>
                </div>
                <input
                  type="text"
                  value={r.memo}
                  onChange={(e) => updateRow(i, { memo: e.target.value })}
                  placeholder="メモ (任意)"
                  maxLength={500}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 placeholder:text-gray-400"
                />
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={addRow}
          data-testid="manual-task-add-row"
          className="w-full rounded-md border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:border-indigo-500 hover:bg-indigo-100"
        >
          + さらにタスクを追加
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          data-testid="manual-task-submit"
          className="h-9 rounded-full bg-indigo-600 px-5 text-[14px] font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-vn-border-strong disabled:text-white"
        >
          {submitting ? '作成中…' : 'タスクを作成する'}
        </button>
      </div>
    </div>
  );
}

// 行ごとのタグ入力 (RoughCaptureSection の RowTagInput と同じ挙動の独立実装)。
function ManualRowTagInput({
  tagIds,
  availableTags,
  onChange,
  onCreateTag,
}: {
  tagIds: string[];
  availableTags: TaskTag[];
  onChange: (tagIds: string[]) => void;
  onCreateTag: (name: string) => Promise<TaskTag | null>;
}) {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focused) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [focused]);

  const selectedTags = availableTags.filter((t) => tagIds.includes(t.id));
  const trimmed = input.trim();
  const normalized = trimmed.toLowerCase();
  const filtered = availableTags
    .filter(
      (t) =>
        !tagIds.includes(t.id) &&
        (normalized === '' || t.name.toLowerCase().includes(normalized)),
    )
    .slice(0, 8);
  const exactMatch = availableTags.find((t) => t.name === trimmed);

  const addTag = (id: string) => {
    if (!tagIds.includes(id)) onChange([...tagIds, id]);
    setInput('');
  };
  const removeTag = (id: string) => onChange(tagIds.filter((tid) => tid !== id));
  const commit = async () => {
    if (!trimmed) return;
    if (exactMatch) {
      addTag(exactMatch.id);
      return;
    }
    setCreating(true);
    try {
      const created = await onCreateTag(trimmed);
      if (created) addTag(created.id);
    } catch {
      // ベストエフォート
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={containerRef} className="relative flex items-center gap-1">
      <span>タグ</span>
      <div className="flex flex-wrap items-center gap-1">
        {selectedTags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-0.5 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] text-indigo-700"
          >
            #{t.name}
            <button
              type="button"
              onClick={() => removeTag(t.id)}
              className="text-indigo-500 hover:text-indigo-700"
              aria-label={`タグ ${t.name} を外す`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            }
          }}
          placeholder="#タグ"
          className="min-w-[64px] rounded border border-gray-300 px-1.5 py-0.5 text-xs"
        />
      </div>
      {focused && (filtered.length > 0 || trimmed.length > 0) && (
        <div className="absolute left-0 top-full z-10 mt-1 max-h-40 w-48 overflow-auto rounded-md border border-gray-200 bg-white text-xs shadow-md">
          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(t.id)}
              className="block w-full px-2 py-1 text-left hover:bg-indigo-50"
            >
              #{t.name}
            </button>
          ))}
          {!exactMatch && trimmed.length > 0 && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void commit()}
              disabled={creating}
              className="block w-full border-t border-gray-100 px-2 py-1 text-left text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
            >
              {creating ? '作成中…' : `+ 「${trimmed}」を作成`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
