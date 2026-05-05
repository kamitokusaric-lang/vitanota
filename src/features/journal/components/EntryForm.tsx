// US-T-010/011: エントリ作成・編集フォーム
// SP-U02-01: Zod スキーマを共有 (サーバーと同じ createEntrySchema を import)
// compact=true: タイムライン最上部に常駐する UI
//   - 初期表示は問いかけ文 + ムード絵文字 5 つのみ
//   - 絵文字をクリック → textarea とタグ選択・公開トグルが展開される
//   - 投稿成功後は form reset + 折りたたみ + 問いかけ切替
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import useSWR from 'swr';
import {
  createEntrySchema,
  type CreateEntryInput,
  type JournalEntryKind,
  type MoodLevel,
} from '@/features/journal/schemas/journal';
import { pickRandomMoodPrompt } from '@/features/journal/lib/mood-prompts';
import { MOOD_OPTIONS } from '@/features/journal/lib/mood-options';
import { TagFilter } from './TagFilter';
import { TagPicker, type TagPickerHandle } from '@/shared/components/TagPicker';
import {
  useKnowledgeTags,
  type KnowledgeTag,
} from '@/features/journal/hooks/useKnowledgeTags';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { IconTooltip } from '@/shared/components/IconTooltip';
import type { EmotionTag, JournalEntry } from '@/db/schema';

export interface EntrySaveResult {
  entry: JournalEntry;
  tags: Array<Pick<EmotionTag, 'id' | 'name' | 'category'>>;
}

interface EntryFormProps {
  mode: 'create' | 'edit';
  // create 時の投稿種別。dashboard 側の kind picker から渡される。default 'diary'。
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
  compact?: boolean;
}

function pickPromptFor(mood: MoodLevel): string {
  const opt = MOOD_OPTIONS.find((o) => o.value === mood);
  if (!opt || opt.prompts.length === 0) return '';
  return opt.prompts[Math.floor(Math.random() * opt.prompts.length)];
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ tags: EmotionTag[] }>;
};

const DEFAULT_VALUES: CreateEntryInput = {
  kind: 'diary',
  content: '',
  tagIds: [],
  isPublic: true,
  // mood は未選択状態で開く (5 アイコンどれも highlight されない)。
  // ユーザーが picker から能動的に選ぶ必要がある (moodPicked=true で submit 可)。
  mood: null,
};

export function EntryForm({
  mode,
  kind = 'diary',
  initialData,
  initialMood,
  onSuccess,
  onCancel,
  compact = false,
}: EntryFormProps) {
  const { data: tagsData, error: tagsError } = useSWR(
    '/api/private/journal/tags',
    fetcher
  );
  // ナレッジタグ (kind='knowledge' の時のみ画面で使う、ただし fetch は常に走る)
  const { tags: knowledgeTags, mutate: mutateKnowledgeTags } = useKnowledgeTags();

  async function handleCreateKnowledgeTag(
    name: string,
  ): Promise<KnowledgeTag | null> {
    const res = await fetch('/api/private/journal/knowledge-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      if (res.status === 409) {
        throw new Error('同じ名前のタグが既にあります');
      }
      throw new Error('タグ作成に失敗しました');
    }
    const data = (await res.json()) as { tag: KnowledgeTag };
    await mutateKnowledgeTags();
    return data.tag;
  }

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
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

  // compact モード 2 段階:
  //   'mood'   : 絵文字 5 つのみ (初期)
  //   'expand' : textarea + タグ + 公開トグル (絵文字クリックで直接展開)
  type CompactStep = 'mood' | 'expand';
  const [step, setStep] = useState<CompactStep>(
    !compact || mode === 'edit' ? 'expand' : 'mood',
  );

  // SSR/CSR で別の文字列が出ると hydration mismatch になるため、
  // 初期値は固定文字列で SSR とクライアント最初のレンダーを揃え、
  // マウント後にクライアントだけランダムに置き換える。
  const [prompt, setPrompt] = useState<string>('調子はどうですか?');
  useEffect(() => {
    setPrompt(pickRandomMoodPrompt());
  }, []);

  // 絵文字選択時に、その mood 専用のランダムプロンプトを textarea placeholder に設定
  const [moodPlaceholder, setMoodPlaceholder] = useState<string>('');

  // mood が能動的に選択されたか (= 5 アイコンのいずれかをクリックした or
  // initialMood で pre-set された)。create 時は picked でないと submit 不可。
  const [moodPicked, setMoodPicked] = useState<boolean>(
    Boolean(initialMood) || mode === 'edit',
  );

  // initialMood (= Modal を開く時に mood が pre-set されてる場合) で
  // placeholder を初期化。マウント時のみ。
  useEffect(() => {
    if (initialMood) {
      setMoodPlaceholder(pickPromptFor(initialMood));
    }
  }, [initialMood]);

  // kind が diary 以外なら mood を null にクリア (Zod superRefine で
  // 「この種別には気分は付けられません」を回避するため)
  useEffect(() => {
    if (kind !== 'diary') {
      setValue('mood', null, { shouldValidate: false });
    }
  }, [kind, setValue]);

  const handleMoodPick = (m: MoodLevel) => {
    setValue('mood', m, { shouldValidate: true });
    setMoodPlaceholder(pickPromptFor(m));
    setStep('expand');
    setMoodPicked(true);
  };

  const handleResetMood = () => {
    setStep('mood');
    setValue('mood', 'neutral');
    setMoodPlaceholder('');
    setMoodPicked(false);
  };

  const resetForm = () => {
    reset(DEFAULT_VALUES);
    setStep('mood');
    setPrompt(pickRandomMoodPrompt());
  };

  const tagPickerRef = useRef<TagPickerHandle>(null);

  const onSubmit = async (data: CreateEntryInput) => {
    // TagPicker の input に保留中の文字があれば、submit 直前に作成 + 紐付け
    // (= 「作成」ボタンを押し忘れた場合の救済)
    let finalTagIds = data.tagIds;
    if (tagPickerRef.current) {
      const flushed = await tagPickerRef.current.flushPending();
      if (flushed && !finalTagIds.includes(flushed.id)) {
        finalTagIds = [...finalTagIds, flushed.id];
      }
    }
    try {
      const url =
        mode === 'create'
          ? '/api/private/journal/entries'
          : `/api/private/journal/entries/${initialData!.id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, tagIds: finalTagIds }),
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

      if (compact) {
        resetForm();
      }
      await onSuccess(entry ? { entry, tags: selectedTags } : undefined);
    } catch {
      setError('root', { message: 'ネットワークエラーが発生しました' });
    }
  };

  const selectedMoodOption = useMemo(
    () => MOOD_OPTIONS.find((o) => o.value === mood),
    [mood],
  );

  if (tagsError) {
    return <ErrorMessage message="タグの取得に失敗しました" />;
  }

  const showFullForm = !compact || step === 'expand';

  const moodCardClass =
    'flex flex-col items-center justify-center gap-1 rounded-vn border border-vn-border bg-white px-2 py-3 transition-all hover:border-vn-accent hover:bg-vn-bg active:scale-95';

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={
        compact
          ? 'rounded-vn border border-vn-border bg-gray-50 p-4'
          : 'space-y-4'
      }
      data-testid="entry-form"
      data-compact={compact ? 'true' : 'false'}
    >
      {/* ムード選択ステップ (compact のみ、edit では非表示) */}
      {compact && step === 'mood' && (
        <div className="mb-3">
          <p
            className="mb-3 text-sm font-medium text-gray-700"
            data-testid="entry-form-prompt"
          >
            {prompt}
          </p>
          <div
            role="group"
            aria-label="ムード選択"
            className="grid grid-cols-5 gap-2"
          >
            {MOOD_OPTIONS.map((opt) => {
              const Icon = opt.Icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleMoodPick(opt.value)}
                  className={`group relative ${moodCardClass}`}
                  aria-label={opt.label}
                  data-testid={`entry-form-mood-${opt.value}`}
                >
                  <Icon
                    aria-hidden
                    size={28}
                    strokeWidth={1.75}
                    className="text-gray-700"
                  />
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-[10px] font-normal text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* compact expand: アイコン + 横並び textarea + 右上に選び直しボタン */}
      {compact && step === 'expand' && selectedMoodOption && (
        <div className="mb-2">
          <div
            className="flex items-start gap-2"
            data-testid="entry-form-mood-label"
          >
            <span className="mt-1 shrink-0">
              <IconTooltip label={selectedMoodOption.label}>
                <selectedMoodOption.Icon
                  size={20}
                  strokeWidth={1.75}
                  className="text-gray-700"
                  aria-hidden
                />
              </IconTooltip>
            </span>
            <textarea
              id="entry-form-content"
              rows={2}
              maxLength={200}
              placeholder={moodPlaceholder || selectedMoodOption.caption}
              className="flex-1 resize-none rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-sm placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-200 focus:placeholder:text-transparent"
              data-testid="entry-form-content-input"
              {...register('content')}
            />
            <button
              type="button"
              onClick={handleResetMood}
              className="flex shrink-0 items-center gap-1 self-start rounded-full border border-gray-300 bg-white px-3 py-1 text-xs text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-800"
              aria-label="ムードを選び直す"
              data-testid="entry-form-mood-reset"
            >
              <span aria-hidden className="text-sm leading-none">⟲</span>
              <span>別の気分にする</span>
            </button>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span
              className={errors.content ? 'text-red-600' : 'text-gray-400'}
              data-testid="entry-form-content-error"
            >
              {errors.content?.message}
            </span>
            <span
              className={
                (content?.length ?? 0) > 200
                  ? 'text-red-600'
                  : 'text-gray-400'
              }
              data-testid="entry-form-content-counter"
            >
              {content?.length ?? 0} / 200
            </span>
          </div>
        </div>
      )}

      {/* 非 compact (edit モーダル / create モーダル): mood picker + textarea。
          mood picker は kind='diary' の create モードのみ表示。
          textarea の maxLength / placeholder / counter は kind 別に分岐。 */}
      {!compact && showFullForm && (
        <div>
          {/* mood 選択 (kind='diary' の create モードでのみ表示) */}
          {mode === 'create' && kind === 'diary' && (
            <div
              role="group"
              aria-label="ムード選択"
              className="mb-3 flex items-center gap-2"
              data-testid="entry-form-mood-picker"
            >
              {MOOD_OPTIONS.map((opt) => {
                const Icon = opt.Icon;
                const isSelected = mood === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleMoodPick(opt.value)}
                    aria-label={opt.label}
                    aria-pressed={isSelected}
                    className={`group relative inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                      isSelected
                        ? 'border-vn-accent bg-vn-accent/10 text-vn-accent'
                        : 'border-vn-border bg-white text-gray-500 hover:border-gray-400 hover:text-gray-700'
                    }`}
                    data-testid={`entry-form-mood-${opt.value}`}
                  >
                    <Icon size={20} strokeWidth={1.75} aria-hidden />
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-[10px] font-normal text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                    >
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {(() => {
            const maxLength = kind === 'tweet' ? 200 : 1000;
            const placeholder =
              kind === 'knowledge'
                ? '気づきや知見をシェア'
                : kind === 'tweet'
                  ? 'いまの気持ちをひとこと'
                  : moodPlaceholder || selectedMoodOption?.caption || '';
            return (
              <>
                <textarea
                  id="entry-form-content"
                  rows={4}
                  maxLength={maxLength}
                  aria-label="記録内容"
                  placeholder={placeholder}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  data-testid="entry-form-content-input"
                  {...register('content')}
                />
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
      )}

      {showFullForm && (
        <>
          {/* タグ選択 (kind 別)
              compact (旧 sticky form、現状未使用): emotion_tags の TagFilter
              !compact + kind=tweet: emotion_tags の TagFilter
              !compact + kind=knowledge: knowledge_tags の TagPicker (タスクと同 UI)
              !compact + kind=diary: 表示なし (Zod superRefine でタグ禁止) */}
          {compact && (
            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                タグを選ぶ
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
          )}
          {!compact && kind === 'tweet' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                今の気分を選んでください
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
          )}
          {!compact && kind === 'knowledge' && (
            <div>
              {knowledgeTags === undefined ? (
                <p className="text-xs text-gray-400">タグを読み込み中...</p>
              ) : (
                <TagPicker
                  ref={tagPickerRef}
                  selectedTagIds={tagIds}
                  onToggle={(tagId) => {
                    const next = tagIds.includes(tagId)
                      ? tagIds.filter((id) => id !== tagId)
                      : [...tagIds, tagId];
                    setValue('tagIds', next, { shouldValidate: true });
                  }}
                  availableTags={knowledgeTags}
                  onCreateTag={handleCreateKnowledgeTag}
                  testIdPrefix="entry-form"
                  label="タグ (任意)"
                  inputPlaceholder="新規タグ名 or 既存タグから選択"
                />
              )}
              {errors.tagIds && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.tagIds.message}
                </p>
              )}
            </div>
          )}

          {/* 公開設定 */}
          <div className={compact ? 'mt-3' : ''}>
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
      )}

      {/* ルートエラー */}
      {errors.root && (
        <div className={compact ? 'mt-3' : ''}>
          <ErrorMessage message={errors.root.message ?? '保存に失敗しました'} />
        </div>
      )}

      {/* 送信・キャンセル */}
      {showFullForm && (
        <div
          className={['flex justify-end gap-2', compact ? 'mt-3' : ''].join(' ')}
        >
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
              (mode === 'create' && kind === 'diary' && !moodPicked) ||
              !(content?.trim().length ?? 0)
            }
            data-testid="entry-form-submit-button"
          >
            {mode === 'create' ? '投稿' : '保存'}
          </Button>
        </div>
      )}
    </form>
  );
}
