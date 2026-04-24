// マイ記録一覧（自分の公開・非公開エントリ両方）
// useSWRInfinite + IntersectionObserver で無限スクロール読み込み
import { useEffect, useRef } from 'react';
import useSWRInfinite from 'swr/infinite';
import { EntryCard, type EntryCardData } from './EntryCard';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { ErrorMessage } from '@/shared/components/ErrorMessage';

interface MyJournalResponse {
  entries: EntryCardData[];
  page: number;
  perPage: number;
}

const fetcher = async (url: string): Promise<MyJournalResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

interface MyJournalListProps {
  perPage?: number;
  onEdit?: (entry: EntryCardData) => void;
  onDelete?: (entry: EntryCardData) => void;
}

export function MyJournalList({
  perPage = 50,
  onEdit,
  onDelete,
}: MyJournalListProps) {
  const { data, error, isLoading, isValidating, size, setSize } =
    useSWRInfinite<MyJournalResponse>(
      (index, prev) => {
        if (prev && prev.entries.length < perPage) return null;
        return `/api/private/journal/entries/mine?page=${index + 1}&perPage=${perPage}`;
      },
      fetcher,
      { revalidateFirstPage: false }
    );

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
      <div className="py-10 text-center" data-testid="my-journal-loading">
        <LoadingSpinner label="マイ記録を読み込み中" />
      </div>
    );
  }

  if (error && !data) {
    return <ErrorMessage message="マイ記録の取得に失敗しました" />;
  }

  if (entries.length === 0) {
    return (
      <div
        className="py-10 text-center text-sm text-gray-500"
        data-testid="my-journal-empty"
      >
        まだ記録がありません
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="my-journal-list">
      {entries.map((entry) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          showPrivacyBadge
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}

      {!reachedEnd && (
        <div
          ref={sentinelRef}
          className="py-4 text-center"
          data-testid="my-journal-sentinel"
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
            data-testid="my-journal-retry"
          >
            再試行
          </button>
        </div>
      )}
    </div>
  );
}
