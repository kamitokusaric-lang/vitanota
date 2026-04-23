// US-T-010/011: エントリ作成・編集フォーム
// SP-U02-01: Zod スキーマを共有（サーバーと同じ createEntrySchema を import）
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
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ tags: EmotionTag[] }>;
};

export function EntryForm({
  mode,
  initialData,
  onSuccess,
  onCancel,
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
      : {
          content: '',
          tagIds: [],
          isPublic: true,
        },
  });

  const content = watch('content');
  const tagIds = watch('tagIds');

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
      className="space-y-4"
      data-testid="entry-form"
    >
      {/* 本文 */}
      <div>
        <label
          htmlFor="entry-form-content"
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          記録内容
        </label>
        <textarea
          id="entry-form-content"
          rows={4}
          maxLength={200}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
              (content?.length ?? 0) > 200 ? 'text-red-600' : 'text-gray-400'
            }
            data-testid="entry-form-content-counter"
          >
            {content?.length ?? 0} / 200
          </span>
        </div>
      </div>

      {/* タグ選択 */}
      <div>
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
      <div>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            data-testid="entry-form-private-checkbox"
            checked={!watch('isPublic')}
            onChange={(e) => setValue('isPublic', !e.target.checked)}
          />
          自分だけに保存（タイムラインに表示しない）
        </label>
      </div>

      {/* ルートエラー */}
      {errors.root && (
        <ErrorMessage message={errors.root.message ?? '保存に失敗しました'} />
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
          data-testid="entry-form-submit-button"
        >
          {mode === 'create' ? '投稿' : '保存'}
        </Button>
      </div>
    </form>
  );
}
