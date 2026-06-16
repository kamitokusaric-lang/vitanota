// 右サイドの入口「自分用の日々ノートを書く」。職員室ノート (TodayCaptureBox) と同じ体裁で、
// 自分だけが見られる diary を残す。種別は diary 固定・常に非公開・mood は扱わない。
// 気持ちタグ (emotion_tags) は本人選択で付けられる (chimo 2026-06-12)。
import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Lock } from 'lucide-react';
import { jsonFetcher } from '@/shared/lib/fetcher';
import { useToast } from '@/shared/components/Toast';
import type { EmotionTag } from '@/db/schema';
import type { MoodLevel } from '@/features/journal/schemas/journal';
import { MOOD_OPTIONS } from '@/features/journal/lib/mood-options';
import { TagFilter } from './TagFilter';

interface DiaryNoteBoxProps {
  onSuccess?: () => void;
  // 編集モード (chimo 2026-06-15): 既存の日々ノートを投稿フォームと同じ UI で編集する。
  editId?: string;
  initialContent?: string;
  initialMood?: MoodLevel | null;
  initialTagIds?: string[];
}

export function DiaryNoteBox({
  onSuccess,
  editId,
  initialContent,
  initialMood,
  initialTagIds,
}: DiaryNoteBoxProps) {
  const isEdit = !!editId;
  const { mutate: globalMutate } = useSWRConfig();
  const { showToast } = useToast();
  const { data: tagsData } = useSWR<{ tags: EmotionTag[] }>(
    '/api/private/journal/tags',
    jsonFetcher,
  );
  const [content, setContent] = useState(initialContent ?? '');
  const [tagIds, setTagIds] = useState<string[]>(initialTagIds ?? []);
  // mood は本人選択 (AI 不可触)。新規は既定 positive、編集は既存値。同じチップ再クリックで解除。
  const [mood, setMood] = useState<MoodLevel | null>(
    initialMood !== undefined ? initialMood : 'positive',
  );
  const [submitting, setSubmitting] = useState(false);

  const refreshFeeds = () =>
    globalMutate(
      (key: unknown) =>
        typeof key === 'string' &&
        key.startsWith('/api/private/journal/entries'),
    );

  const handleSubmit = async () => {
    const text = content.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        isEdit
          ? `/api/private/journal/entries/${editId}`
          : '/api/private/journal/entries',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'note',
            content: text,
            tagIds,
            isPublic: false, // 倉庫 (自分用) の note は常に非公開
            mood,
          }),
        },
      );
      if (!res.ok) {
        showToast('保存に失敗しました', 'error');
        return;
      }
      await refreshFeeds();
      if (!isEdit) {
        setContent('');
        setTagIds([]);
        setMood('positive');
      }
      showToast(isEdit ? '保存しました' : '残しました', 'success');
      onSuccess?.();
    } catch {
      showToast('保存に失敗しました', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* タイトル下: 保存範囲を明示 (職員室ノートと同じ体裁)。 */}
      <div
        className="flex items-center gap-2 rounded-md border border-sky-200 bg-sky-100 px-3 py-2.5 text-[13px] font-medium text-sky-700"
        data-testid="diary-note-banner"
      >
        <Lock size={15} strokeWidth={2} className="shrink-0" aria-hidden />
        自分だけが見られる記録としてマイノートに保存されます
      </div>

      {/* 今の気持ち (mood)。本人選択・AI 不可触。職員室ノートと同じ独立した行の体裁。 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          今の気持ち
        </label>
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="今の気持ち"
          data-testid="diary-mood-picker"
        >
          {MOOD_OPTIONS.map((opt) => {
            const Icon = opt.Icon;
            const selected = mood === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  setMood((cur) => (cur === opt.value ? null : opt.value))
                }
                aria-pressed={selected}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors ${
                  selected
                    ? 'bg-vn-accent text-white'
                    : 'bg-vn-muted-bg text-slate-500 hover:bg-slate-200'
                }`}
                data-testid={`diary-mood-${opt.value}`}
              >
                <Icon size={14} strokeWidth={1.75} aria-hidden />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        maxLength={1000}
        placeholder="今日の出来事、気づき、ふりかえり… 自分のために残しておけます。"
        className="w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-vn-accent focus:outline-none"
        data-testid="diary-content-input"
      />
      <div className="-mt-2 text-right text-xs text-gray-400" data-testid="diary-counter">
        {content.length} / 1000
      </div>

      {/* 気持ちタグ (emotion_tags)。職員室ノートと同じ体裁。 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          気持ちタグ
        </label>
        {tagsData ? (
          <TagFilter
            tags={tagsData.tags}
            selectedTagIds={tagIds}
            onChange={setTagIds}
          />
        ) : (
          <p className="text-xs text-gray-400">タグを読み込み中...</p>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!content.trim() || submitting}
          className="rounded-full bg-vn-accent px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          data-testid="diary-submit"
        >
          {isEdit ? '保存' : '書く'}
        </button>
      </div>
    </div>
  );
}
