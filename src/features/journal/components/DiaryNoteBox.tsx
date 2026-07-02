// 右サイドの入口「自分用の日々ノートを書く」。職員室ノート (TodayCaptureBox) と同じ体裁で、
// 自分だけが見られる diary を残す。種別は diary 固定・常に非公開・mood は扱わない。
// 気持ちタグ (emotion_tags) は本人選択で付けられる (chimo 2026-06-12)。
// chimo 2026-06-26: 本文を「3行日誌テンプレ (和らげ KPT)」/「自由記述」で切替。既定はテンプレ。
//   テンプレは content 単一カラムに見出し付きで束ねる (reflectionTemplate.ts・DB 変更なし)。
import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { jsonFetcher } from '@/shared/lib/fetcher';
import { useToast } from '@/shared/components/Toast';
import type { EmotionTag } from '@/db/schema';
import type { MoodLevel } from '@/features/journal/schemas/journal';
import { MOOD_OPTIONS } from '@/features/journal/lib/mood-options';
import {
  REFLECTION_SECTIONS,
  composeReflection,
  parseReflection,
  emptyReflectionValues,
  type ReflectionKey,
  type ReflectionValues,
} from '@/features/journal/lib/reflectionTemplate';
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
  // 既定はテンプレ。編集時は既存 content を見て、テンプレ形式なら復元・自由記述なら自由モードで開く。
  const parsedInitial = parseReflection(initialContent ?? '');
  const [mode, setMode] = useState<'template' | 'free'>(
    initialContent === undefined || parsedInitial.isTemplate ? 'template' : 'free',
  );
  const [content, setContent] = useState(initialContent ?? '');
  const [reflection, setReflection] = useState<ReflectionValues>(
    parsedInitial.isTemplate ? parsedInitial.values : emptyReflectionValues(),
  );
  const [tagIds, setTagIds] = useState<string[]>(initialTagIds ?? []);
  // mood は本人選択 (AI 不可触)。新規は既定 positive、編集は既存値。同じチップ再クリックで解除。
  const [mood, setMood] = useState<MoodLevel | null>(
    initialMood !== undefined ? initialMood : 'positive',
  );
  const [submitting, setSubmitting] = useState(false);
  // design2 (chimo 2026-06-25): 入力欄は初期 1 行、フォーカス/入力中にアニメで展開。
  const [focused, setFocused] = useState(false);

  const refreshFeeds = () =>
    globalMutate(
      (key: unknown) =>
        typeof key === 'string' &&
        key.startsWith('/api/private/journal/entries'),
    );

  // 保存する本文: テンプレモードは 3 区分を直列化、自由モードはそのまま。
  const composed = mode === 'template' ? composeReflection(reflection) : content.trim();
  const overLimit = composed.length > 1000;
  const canSubmit = composed.length > 0 && !overLimit;

  const handleSubmit = async () => {
    const text = composed;
    if (!canSubmit || submitting) return;
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
      // 新規ふりかえり保存を起点に AIリコメンド計算を裏で走らせる (fire-and-forget・保存を邪魔しない)。
      // 結果はマイノート詳細で受け取る。フラグ off / 失敗時は何も起きない (best-effort)。
      if (!isEdit) {
        try {
          const created = await res.json();
          const newId: string | undefined = created?.entry?.id;
          if (newId) {
            void fetch('/api/journal/recommend', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ entryId: newId }),
            }).catch(() => {});
          }
        } catch {
          /* リコメンドは best-effort。本体の保存は成功している。 */
        }
      }
      await refreshFeeds();
      if (!isEdit) {
        setContent('');
        setReflection(emptyReflectionValues());
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

      {/* 本文の書き方: テンプレ (3 行日誌) / 自由記述 を切替。既定はテンプレ。 */}
      <div>
        <div
          className="mb-2 inline-flex rounded-md border border-vn-border bg-white p-0.5 text-xs"
          role="group"
          aria-label="書き方"
          data-testid="diary-mode-toggle"
        >
          <button
            type="button"
            onClick={() => setMode('template')}
            aria-pressed={mode === 'template'}
            className={`rounded px-2.5 py-1 transition-colors ${
              mode === 'template'
                ? 'bg-vn-accent/10 font-semibold text-vn-accent'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            data-testid="diary-mode-template"
          >
            テンプレで書く
          </button>
          <button
            type="button"
            onClick={() => setMode('free')}
            aria-pressed={mode === 'free'}
            className={`rounded px-2.5 py-1 transition-colors ${
              mode === 'free'
                ? 'bg-vn-accent/10 font-semibold text-vn-accent'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            data-testid="diary-mode-free"
          >
            自由に書く
          </button>
        </div>

        {mode === 'template' ? (
          <div className="space-y-3" data-testid="diary-template-fields">
            {REFLECTION_SECTIONS.map((s) => (
              <div key={s.key}>
                <label
                  className="mb-1 block text-xs font-medium text-gray-700"
                  htmlFor={`diary-reflection-${s.key}`}
                >
                  {s.heading}
                </label>
                <textarea
                  id={`diary-reflection-${s.key}`}
                  value={reflection[s.key]}
                  onChange={(e) =>
                    setReflection((cur) => ({
                      ...cur,
                      [s.key as ReflectionKey]: e.target.value,
                    }))
                  }
                  placeholder={s.placeholder}
                  className="min-h-[56px] w-full resize-none rounded-md border border-vn-border-strong bg-white px-3 py-2 text-sm focus:border-vn-accent focus:outline-none focus:ring-2 focus:ring-vn-accent/20"
                  data-testid={`diary-reflection-${s.key}`}
                />
              </div>
            ))}
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            maxLength={1000}
            placeholder="今日の出来事、気づき、ふりかえり… 自分のために残しておけます。"
            className={`w-full resize-none rounded-md border border-vn-border-strong bg-white px-3 py-2 text-sm transition-all duration-200 ease-out focus:border-vn-accent focus:outline-none focus:ring-2 focus:ring-vn-accent/20 ${
              focused || content.length > 0 ? 'min-h-[96px]' : 'min-h-[42px]'
            }`}
            data-testid="diary-content-input"
          />
        )}
        {composed.length > 0 && (
          <div
            className={`mt-1 text-right text-xs ${overLimit ? 'text-vn-warning-text' : 'text-gray-400'}`}
            data-testid="diary-counter"
          >
            {composed.length} / 1000
          </div>
        )}
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
          disabled={!canSubmit || submitting}
          className="rounded-full bg-vn-accent px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-vn-accent-hover hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          data-testid="diary-submit"
        >
          {isEdit ? '保存' : '書く'}
        </button>
      </div>
    </div>
  );
}
