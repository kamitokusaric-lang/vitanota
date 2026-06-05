// US-T-010/011: エントリ作成・編集フォーム
// SP-U02-01: Zod スキーマを共有 (サーバーと同じ createEntrySchema を import)
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import useSWR from 'swr';
import { jsonFetcher } from '@/shared/lib/fetcher';
import {
  createEntrySchema,
  type CreateEntryInput,
  type JournalEntryKind,
  type MoodLevel,
} from '@/features/journal/schemas/journal';
import { MOOD_OPTIONS } from '@/features/journal/lib/mood-options';
import { TagFilter } from './TagFilter';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import type { EmotionTag, JournalEntry } from '@/db/schema';

export interface EntrySaveResult {
  entry: JournalEntry;
  tags: Array<Pick<EmotionTag, 'id' | 'name' | 'category'>>;
}

interface EntryFormProps {
  mode: 'create' | 'edit';
  // create 時の投稿種別。新規投稿は単一 CTA「ひとこと残す」経由で default 'tweet'。
  // edit 時は initialData.kind を優先 (diary/knowledge 既存レコードを保持)。
  kind?: JournalEntryKind;
  initialData?: {
    id: string;
    kind?: JournalEntryKind;
    content: string;
    tagIds: string[];
    isPublic: boolean;
    mood?: MoodLevel | null;
  };
  // create 時に mood を事前選択した状態で開く (modal トリガー側で mood を picked 済の場合)
  initialMood?: MoodLevel;
  onSuccess: (result?: EntrySaveResult) => void | Promise<void>;
  onCancel?: () => void;
}

// 選択時の mood ごと淡い背景色 (chimo アドバイス 2026-05-27)。
// 「危険・警告・評価」 に見えないよう赤系は控えめ、 学校現場向けに彩度低め。
// 2026-05-27 chimo 指示: 5 → 3 種化、 旧 very_positive/very_negative は UI から除外。
const MOOD_SELECTED_CLASS: Partial<Record<MoodLevel, string>> = {
  positive: 'border-lime-200 bg-lime-50 text-lime-700',
  neutral:  'border-sky-200 bg-sky-50 text-sky-700',
  negative: 'border-amber-200 bg-amber-50 text-amber-700',
};

// textarea 全体の背景色 (mood 選択に連動、 chimo 指示 2026-05-27)。
// 選択した mood の世界観を textarea にも染み込ませる、 一体感を強化。
const MOOD_TEXTAREA_BG: Partial<Record<MoodLevel, string>> = {
  positive: 'bg-lime-50',
  neutral:  'bg-sky-50',
  negative: 'bg-amber-50',
};

const DEFAULT_VALUES: CreateEntryInput = {
  // 2026-05-27: 新規投稿は「ひとこと残す」単一 CTA に統合、 default 'tweet' (H6/H8 検証)。
  // diary/knowledge は edit 経路でのみ使用される (初期値ではなく initialData.kind 経由で復元)。
  kind: 'tweet',
  content: '',
  tagIds: [],
  isPublic: true,
  // mood の default は 'positive' (= 良い)。 ポジティブを起点にして投稿のハードルを下げる。
  // 違う気分なら 3 チップから選び直せる、 同じチップ再クリックで解除も可能。
  mood: 'positive',
};

export function EntryForm({
  mode,
  kind = 'tweet',
  initialData,
  initialMood,
  onSuccess,
  onCancel,
}: EntryFormProps) {
  const { data: tagsData, error: tagsError } = useSWR(
    '/api/private/journal/tags',
    jsonFetcher<{ tags: EmotionTag[] }>,
  );
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<CreateEntryInput>({
    resolver: zodResolver(createEntrySchema),
    defaultValues: initialData
      ? {
          kind: initialData.kind ?? 'diary',
          content: initialData.content,
          tagIds: initialData.tagIds,
          isPublic: initialData.isPublic,
          mood: initialData.mood ?? 'neutral',
        }
      : {
          ...DEFAULT_VALUES,
          kind,
          mood: initialMood ?? DEFAULT_VALUES.mood,
        },
  });

  const content = watch('content');
  const tagIds = watch('tagIds');
  const isPublic = watch('isPublic');
  const mood = watch('mood');

  // 2026-05-27: 旧仕様で kind!=='diary' なら mood を null クリアしていたが、
  // tweet/knowledge にも mood を任意で付けられるようにしたため、 強制クリアは廃止。
  // mood は本人選択のみ ([[feedback_mood_ai_untouchable]] AI 非関与の原則は維持)。

  const handleMoodPick = (m: MoodLevel) => {
    // 同じ絵文字を再クリックで解除可能 (tweet/knowledge では mood 任意)。
    if (mood === m) {
      setValue('mood', null, { shouldValidate: true });
      return;
    }
    setValue('mood', m, { shouldValidate: true });
  };

  const onSubmit = async (data: CreateEntryInput) => {
    try {
      const url =
        mode === 'create'
          ? '/api/private/journal/entries'
          : `/api/private/journal/entries/${initialData!.id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        setError('root', {
          message: body.message ?? '保存に失敗しました',
        });
        return;
      }

      const { entry } = (await res.json().catch(() => ({}))) as {
        entry?: JournalEntry;
      };
      const selectedTags = (tagsData?.tags ?? [])
        .filter((t) => data.tagIds.includes(t.id))
        .map((t) => ({ id: t.id, name: t.name, category: t.category }));

      await onSuccess(entry ? { entry, tags: selectedTags } : undefined);
    } catch {
      setError('root', { message: 'ネットワークエラーが発生しました' });
    }
  };

  if (tagsError) {
    return <ErrorMessage message="タグの取得に失敗しました" />;
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4"
      data-testid="entry-form"
    >
      {/* textarea + 内側上部に mood チップ群 (作成/編集 共通)。
          2026-05-27 chimo 指示 (アドバイス採用 + textarea 内配置):
          - mood チップ群を textarea の上部 absolute で重ね、 textarea と一体化
          - 別 section にすると「入力しなくていいもの」 と思われる懸念回避
          - 初期未選択、 何も選ばずに投稿しても OK */}
      <div>
          {(() => {
            const maxLength = 1000;
            // 2026-05-27 chimo 指示: kind 分岐撤廃、 placeholder 単一化
            const placeholder = '生徒の様子、よかった出来事、ちょっとした気づきなど...';
            return (
              <>
                <div className="relative">
                  {/* 2026-05-27 chimo 指示: edit 経路でも mood picker 表示 (作成画面と完全統一) */}
                  <div
                    role="group"
                    aria-label="今の気持ちは？"
                    className="absolute left-px right-px top-px z-10 flex flex-wrap items-center gap-1.5 rounded-t-md bg-vn-muted-bg px-2 py-1.5"
                    data-testid="entry-form-mood-picker"
                  >
                      <span className="mr-1 text-xs font-medium text-gray-700">
                        今の気持ちは？
                      </span>
                      {MOOD_OPTIONS.map((opt) => {
                        const Icon = opt.Icon;
                        const isSelected = mood === opt.value;
                        const selectedClass = MOOD_SELECTED_CLASS[opt.value] ?? '';
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => handleMoodPick(opt.value)}
                            aria-label={opt.label}
                            aria-pressed={isSelected}
                            className={`inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-sm transition-colors ${
                              isSelected
                                ? selectedClass
                                : 'border-vn-border bg-white text-gray-500 hover:border-gray-400 hover:text-gray-700'
                            }`}
                            data-testid={`entry-form-mood-${opt.value}`}
                          >
                            <Icon size={16} strokeWidth={1.75} aria-hidden />
                            <span>{opt.label}</span>
                          </button>
                        );
                      })}
                  </div>
                  <textarea
                    id="entry-form-content"
                    rows={8}
                    maxLength={maxLength}
                    aria-label="記録内容"
                    placeholder={placeholder}
                    className={`w-full rounded-md border border-gray-300 pt-12 px-3 pb-2 text-sm transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:outline-none ${
                      (mood && MOOD_TEXTAREA_BG[mood]) || 'bg-white'
                    }`}
                    data-testid="entry-form-content-input"
                    {...register('content')}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span
                    className={
                      errors.content ? 'text-red-600' : 'text-gray-400'
                    }
                    data-testid="entry-form-content-error"
                  >
                    {errors.content?.message}
                  </span>
                  <span
                    className={
                      (content?.length ?? 0) > maxLength
                        ? 'text-red-600'
                        : 'text-gray-400'
                    }
                    data-testid="entry-form-content-counter"
                  >
                    {content?.length ?? 0} / {maxLength}
                  </span>
                </div>
              </>
            );
          })()}
        </div>

      <>
          {/* 2026-05-27 chimo 指示: タグ選択は kind 分岐撤廃、 emotion_tags TagFilter で統一。
              旧 knowledge_tags TagPicker / compact 別ラベル は廃止。
              既存 knowledge レコードの knowledge_tags 編集 UI は無くなる (DB データは残る)。 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              気持ちタグ
            </label>
            {tagsData ? (
              <TagFilter
                tags={tagsData.tags}
                selectedTagIds={tagIds}
                onChange={(ids) =>
                  setValue('tagIds', ids, { shouldValidate: true })
                }
              />
            ) : (
              <p className="text-xs text-gray-400">タグを読み込み中...</p>
            )}
            {errors.tagIds && (
              <p className="mt-1 text-xs text-red-600">
                {errors.tagIds.message}
              </p>
            )}
          </div>

          {/* 公開設定 */}
          <div>
            <label
              className="inline-flex cursor-pointer items-center gap-3"
              htmlFor="entry-form-is-public-toggle"
            >
              <span className="relative inline-block h-5 w-9 flex-shrink-0">
                <input
                  id="entry-form-is-public-toggle"
                  type="checkbox"
                  role="switch"
                  className="peer sr-only"
                  data-testid="entry-form-is-public-toggle"
                  checked={!isPublic}
                  onChange={(e) => setValue('isPublic', !e.target.checked)}
                />
                <span
                  className={[
                    'absolute inset-0 rounded-full transition-colors',
                    !isPublic ? 'bg-blue-600' : 'bg-gray-300',
                  ].join(' ')}
                />
                <span
                  className={[
                    'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]',
                    !isPublic ? 'left-[18px]' : 'left-0.5',
                  ].join(' ')}
                />
              </span>
              <span className="text-sm text-gray-700">
                マイノートだけに表示
              </span>
            </label>
            {!isPublic && (
              <p className="mt-1 ml-12 text-xs text-gray-400">
                自分だけが見られる記録として保存されます
              </p>
            )}
          </div>
        </>
      {errors.root && (
        <div>
          <ErrorMessage message={errors.root.message ?? '保存に失敗しました'} />
        </div>
      )}

      {/* 送信・キャンセル */}
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              data-testid="entry-form-cancel-button"
            >
              キャンセル
            </Button>
          )}
          <Button
            type="submit"
            isLoading={isSubmitting}
            disabled={
              !(content?.trim().length ?? 0)
            }
            data-testid="entry-form-submit-button"
          >
            共有する
          </Button>
        </div>
    </form>
  );
}

