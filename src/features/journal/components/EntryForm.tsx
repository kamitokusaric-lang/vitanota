// US-T-010/011: エントリ作成・編集フォーム
// SP-U02-01: Zod スキーマを共有（サーバーと同じ createEntrySchema を import）
// compact=true: タイムライン最上部に常駐する X ライクな段階展開 UI
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import useSWR from 'swr';
import {
  createEntrySchema,
  type CreateEntryInput,
} from '@/features/journal/schemas/journal';
import { TagFilter } from './TagFilter';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import type { EmotionTag } from '@/db/schema';

interface EntryFormProps {
  mode: 'create' | 'edit';
  initialData?: {
    id: string;
    content: string;
    tagIds: string[];
    isPublic: boolean;
  };
  onSuccess: () => void;
  onCancel?: () => void;
  compact?: boolean;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ tags: EmotionTag[] }>;
};

const DEFAULT_VALUES: CreateEntryInput = {
  content: '',
  tagIds: [],
  isPublic: true,
};

export function EntryForm({
  mode,
  initialData,
  onSuccess,
  onCancel,
  compact = false,
}: EntryFormProps) {
  const { data: tagsData, error: tagsError } = useSWR(
    '/api/private/journal/tags',
    fetcher
  );

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
          content: initialData.content,
          tagIds: initialData.tagIds,
          isPublic: initialData.isPublic,
        }
      : DEFAULT_VALUES,
  });

  const content = watch('content');
  const tagIds = watch('tagIds');
  const isPublic = watch('isPublic');

  const [expanded, setExpanded] = useState(!compact);
  const showOptions = expanded || (content?.length ?? 0) > 0;

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

      if (compact) {
        reset(DEFAULT_VALUES);
        setExpanded(false);
      }
      onSuccess();
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
      className={
        compact
          ? 'rounded-vn border border-vn-border bg-white p-4'
          : 'space-y-4'
      }
      data-testid="entry-form"
      data-compact={compact ? 'true' : 'false'}
    >
      {/* 本文 */}
      <div>
        {!compact && (
          <label
            htmlFor="entry-form-content"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            記録内容
          </label>
        )}
        <textarea
          id="entry-form-content"
          rows={compact && !showOptions ? 2 : 4}
          maxLength={200}
          placeholder={compact ? 'いまの気持ちや出来事をメモ...' : undefined}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          data-testid="entry-form-content-input"
          onFocus={() => compact && setExpanded(true)}
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
              (content?.length ?? 0) > 200 ? 'text-red-600' : 'text-gray-400'
            }
            data-testid="entry-form-content-counter"
          >
            {content?.length ?? 0} / 200
          </span>
        </div>
      </div>

      {showOptions && (
        <>
          {/* タグ選択 */}
          <div className={compact ? 'mt-3' : ''}>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              タグ（任意・最大10件）
            </label>
            {tagsData ? (
              <TagFilter
                tags={tagsData.tags}
                selectedTagIds={tagIds}
                onChange={(ids) => setValue('tagIds', ids, { shouldValidate: true })}
              />
            ) : (
              <p className="text-xs text-gray-400">タグを読み込み中...</p>
            )}
            {errors.tagIds && (
              <p className="mt-1 text-xs text-red-600">{errors.tagIds.message}</p>
            )}
          </div>

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
                  checked={isPublic}
                  onChange={(e) => setValue('isPublic', e.target.checked)}
                />
                <span
                  className={[
                    'absolute inset-0 rounded-full transition-colors',
                    isPublic ? 'bg-blue-600' : 'bg-gray-300',
                  ].join(' ')}
                />
                <span
                  className={[
                    'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]',
                    isPublic ? 'left-[18px]' : 'left-0.5',
                  ].join(' ')}
                />
              </span>
              <span className="text-sm text-gray-700">
                タイムラインに共有する
              </span>
            </label>
            <p className="mt-1 ml-12 text-xs text-gray-400">
              {isPublic
                ? 'テナント内の全員に表示されます'
                : '自分だけが見られる記録として保存されます'}
            </p>
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
      <div className={['flex justify-end gap-2', compact ? 'mt-3' : ''].join(' ')}>
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
          data-testid="entry-form-submit-button"
        >
          {mode === 'create' ? '投稿' : '保存'}
        </Button>
      </div>
    </form>
  );
}
