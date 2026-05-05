// 汎用タグ選択 UI (TaskForm / EntryForm 両方で利用)
//   - 選択中タグを上部に強調 (gray-700 chip + ×)
//   - よく使われるタグ (assignmentCount top 10、未選択分のみ) を下に控えめに (vn-muted-bg chip)
//   - 新規タグ名 input + 完全一致は toggle、含む候補は「もしかして」サジェスト
//
// flushPending: 親 form の submit 直前に呼ぶことで、input に保留中の文字
// (= ユーザーが「作成」ボタンを押し忘れた状態) を自動で作成 + 紐付ける。
// 親が forwardRef 経由で ref.current?.flushPending() を await すれば、
// 「作成ボタン押し忘れ」UX 罠を回避できる (TaskForm / EntryForm 共通)。
import {
  forwardRef,
  useImperativeHandle,
  useState,
} from 'react';
import { Button } from '@/shared/components/Button';

export interface TagPickerTag {
  id: string;
  name: string;
  assignmentCount: number;
}

export interface TagPickerHandle {
  // input の保留中文字を作成 + 紐付ける。
  // 既存名と完全一致なら toggle、新規なら API 経由で作成。
  // 戻り値: 紐付いた (新規 or 既存) タグ情報、もしくは保留なしで null。
  flushPending: () => Promise<{ id: string; name: string } | null>;
}

interface TagPickerProps {
  selectedTagIds: string[];
  onToggle: (tagId: string) => void;
  availableTags: TagPickerTag[];
  // タグ作成 callback (省略時は新規作成 input 非表示)
  onCreateTag?: (name: string) => Promise<{ id: string; name: string } | null>;
  readonly?: boolean;
  // data-testid prefix (例: "task-form" → task-form-tag-{id} 等)
  testIdPrefix?: string;
  // ラベル文 (省略時は表示なし)
  label?: string;
  inputPlaceholder?: string;
}

export const TagPicker = forwardRef<TagPickerHandle, TagPickerProps>(
  function TagPicker(
    {
      selectedTagIds,
      onToggle,
      availableTags,
      onCreateTag,
      readonly = false,
      testIdPrefix = 'tag-picker',
      label,
      inputPlaceholder = '新規タグ名 or 既存タグから選択',
    },
    ref,
  ) {
    const [newTagName, setNewTagName] = useState('');
    const [creatingTag, setCreatingTag] = useState(false);
    const [tagCreateError, setTagCreateError] = useState<string | null>(null);

    const top10Tags = availableTags
      .slice()
      .sort((a, b) => b.assignmentCount - a.assignmentCount)
      .slice(0, 10);
    const selectedTagObjects = availableTags.filter((t) =>
      selectedTagIds.includes(t.id),
    );
    const popularUnselectedTags = top10Tags.filter(
      (t) => !selectedTagIds.includes(t.id),
    );

    // input に入力された name を「作成または toggle」する共通ロジック。
    // 戻り値: 紐付いたタグ (= 新規作成 or 既存)、保留なし or 失敗時 null。
    async function commitName(
      name: string,
    ): Promise<{ id: string; name: string } | null> {
      if (!onCreateTag) return null;
      const trimmed = name.trim();
      if (!trimmed) return null;
      // 既存タグ名と完全一致なら新規作成せず toggle (重複作成防止)
      const existing = availableTags.find((t) => t.name === trimmed);
      if (existing) {
        if (!selectedTagIds.includes(existing.id)) {
          onToggle(existing.id);
        }
        setNewTagName('');
        return existing;
      }
      setCreatingTag(true);
      setTagCreateError(null);
      try {
        const created = await onCreateTag(trimmed);
        if (created) {
          onToggle(created.id);
          setNewTagName('');
          return created;
        }
        return null;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'タグ作成に失敗しました';
        setTagCreateError(message);
        return null;
      } finally {
        setCreatingTag(false);
      }
    }

    async function handleCreateOrToggleTag() {
      await commitName(newTagName);
    }

    useImperativeHandle(
      ref,
      () => ({
        flushPending: async () => commitName(newTagName),
      }),
      [newTagName, availableTags, selectedTagIds, onCreateTag],
    );

    return (
      <div>
        {label && (
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {label}
          </label>
        )}
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
                  onClick={() => onToggle(tg.id)}
                  className="inline-flex items-center gap-1 rounded-full bg-gray-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  data-testid={`${testIdPrefix}-tag-selected-${tg.id}`}
                >
                  #{tg.name}
                  {!readonly && <span className="text-gray-300">×</span>}
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
                  onClick={() => onToggle(tg.id)}
                  className="inline-flex rounded-full bg-vn-muted-bg px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-vn-border disabled:opacity-50"
                  data-testid={`${testIdPrefix}-tag-${tg.id}`}
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
                placeholder={inputPlaceholder}
                maxLength={100}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-xs"
                data-testid={`${testIdPrefix}-new-tag-name`}
                disabled={creatingTag}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleCreateOrToggleTag}
                isLoading={creatingTag}
                disabled={!newTagName.trim()}
                className="text-xs"
                data-testid={`${testIdPrefix}-new-tag-create`}
              >
                {availableTags.find((t) => t.name === newTagName.trim())
                  ? '追加'
                  : '作成'}
              </Button>
            </div>
            {(() => {
              const q = newTagName.trim();
              if (!q) return null;
              const suggestions = availableTags.filter(
                (t) =>
                  t.name !== q &&
                  t.name.includes(q) &&
                  !selectedTagIds.includes(t.id),
              );
              if (suggestions.length === 0) return null;
              return (
                <div
                  className="mt-1 flex flex-wrap items-center gap-1 text-xs"
                  data-testid={`${testIdPrefix}-tag-suggestions`}
                >
                  <span className="text-gray-500">もしかして:</span>
                  {suggestions.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        onToggle(t.id);
                        setNewTagName('');
                      }}
                      className="rounded-full bg-vn-muted-bg px-2 py-0.5 font-medium text-gray-600 hover:bg-vn-border"
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
    );
  },
);
