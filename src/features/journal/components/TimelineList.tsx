// US-T-014: 共有タイムライン表示
// useSWRInfinite + IntersectionObserver で無限スクロール読み込み
//
// 投稿即時反映: useSWRConfig の global mutate は matcher 関数に `$inf$` キーを
// 渡さない (SWR v2.4.1 internalMutate が $inf$/$sub$ を skip する) ため、
// 親 (TimelineTab) から revalidate を走らせるには useSWRInfinite 由来の
// mutate を親に渡す必要がある。mutateRef にセットして親がそれを呼ぶ。
import { useEffect, useRef, type MutableRefObject } from 'react';
import useSWRInfinite from 'swr/infinite';
import { EntryCard, type EntryCardData } from './EntryCard';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { ErrorMessage } from '@/shared/components/ErrorMessage';

interface TimelineResponse {
  entries: EntryCardData[];
  page: number;
  perPage: number;
}

const fetcher = async (url: string): Promise<TimelineResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export type TimelineMutate = () => Promise<unknown>;

interface TimelineListProps {
  perPage?: number;
  currentUserId?: string;
  onEdit?: (entry: EntryCardData) => void;
  onDelete?: (entry: EntryCardData) => void;
  mutateRef?: MutableRefObject<TimelineMutate | null>;
}

export function TimelineList({
  perPage = 50,
  currentUserId,
  onEdit,
  onDelete,
  mutateRef,
}: TimelineListProps) {
  const { data, error, isLoading, isValidating, size, setSize, mutate } =
    useSWRInfinite<TimelineResponse>(
      (index, prev) => {
        if (prev && prev.entries.length < perPage) return null;
        return `/api/public/journal/entries?page=${index + 1}&perPage=${perPage}`;
      },
      fetcher,
      {
        revalidateFirstPage: false,
        revalidateOnFocus: true,
        revalidateOnMount: true,
      }
    );

  useEffect(() => {
    if (!mutateRef) return;
    mutateRef.current = () => mutate();
    return () => {
      mutateRef.current = null;
    };
  }, [mutate, mutateRef]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const entries = data?.flatMap((p) => p.entries) ?? [];
  const lastPage = data?.[data.length - 1];
  const reachedEnd = lastPage !== undefined && lastPage.entries.length < perPage;
  const isLoadingMore =
    isValidating && data !== undefined && size > data.length;

  useEffect(() => {
    if (reachedEnd) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isValidating) {
          setSize((s) => s + 1);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reachedEnd, isValidating, setSize]);

  if (isLoading && !data) {
    return (
      <div className="py-10 text-center" data-testid="timeline-list-loading">
        <LoadingSpinner label="タイムラインを読み込み中" />
      </div>
    );
  }

  if (error && !data) {
    return <ErrorMessage message="タイムラインの取得に失敗しました" />;
  }

  if (entries.length === 0) {
    return (
      <div
        className="py-10 text-center text-sm text-gray-500"
        data-testid="timeline-list-empty"
      >
        まだ共有された記録がありません
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="timeline-list">
      {entries.map((entry) => {
        const isMine = currentUserId !== undefined && entry.userId === currentUserId;
        return (
          <EntryCard
            key={entry.id}
            entry={entry}
            onEdit={isMine ? onEdit : undefined}
            onDelete={isMine ? onDelete : undefined}
          />
        );
      })}

      {!reachedEnd && (
        <div
          ref={sentinelRef}
          className="py-4 text-center"
          data-testid="timeline-list-sentinel"
        >
          {isLoadingMore ? (
            <LoadingSpinner label="さらに読み込み中" />
          ) : (
            <span className="text-xs text-gray-400">読み込み中...</span>
          )}
        </div>
      )}

      {error && data && (
        <div className="py-4 text-center">
          <button
            type="button"
            onClick={() => setSize(size)}
            className="text-xs text-blue-600 hover:underline"
            data-testid="timeline-list-retry"
          >
            再試行
          </button>
        </div>
      )}
    </div>
  );
}
