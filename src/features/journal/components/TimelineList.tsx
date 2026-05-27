// US-T-014: 共有タイムライン表示
// useSWRInfinite + IntersectionObserver で無限スクロール読み込み
//
// 投稿即時反映: useSWRConfig の global mutate は matcher 関数に `$inf$` キーを
// 渡さない (SWR v2.4.1 internalMutate が $inf$/$sub$ を skip する) ため、
// 親 (TimelineTab) から revalidate を走らせるには useSWRInfinite 由来の
// mutate を親に渡す必要がある。mutateRef にセットして親がそれを呼ぶ。
import { Fragment, useEffect, useRef, type MutableRefObject } from 'react';
import useSWRInfinite from 'swr/infinite';
import { EntryCard, type EntryCardData } from './EntryCard';
import { DayDivider, isSameLocalDay } from './DayDivider';
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
  // 表示する種別 (省略 or 全 3 種 含む = フィルタなし)。kind が空配列なら全件非表示。
  kindFilter?: import('@/features/journal/schemas/journal').JournalEntryKind[];
}

export function TimelineList({
  perPage = 50,
  currentUserId,
  onEdit,
  onDelete,
  mutateRef,
  kindFilter,
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
  const allEntries = data?.flatMap((p) => p.entries) ?? [];
  // kind filter 適用:
  //   - kind が filter に含まれる → 表示
  //   - filter に 'knowledge' が含まれる場合、ナレッジ reaction>0 の他種別 entry も表示
  //     (= 他の人が「ナレッジ」と感じた投稿は kind に関わらずナレッジ扱い)
  //     2026-05-27 (H9): reaction が 3 種化、 ここでは knowledge reaction のみ参照。
  const entries = kindFilter
    ? allEntries.filter((e) => {
        if (kindFilter.includes(e.kind ?? 'diary')) return true;
        if (
          kindFilter.includes('knowledge') &&
          (e.reactions?.knowledge.count ?? 0) > 0
        ) {
          return true;
        }
        return false;
      })
    : allEntries;
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
    <div data-testid="timeline-list">
      {entries.map((entry, idx) => {
        const prev = idx > 0 ? entries[idx - 1] : null;
        const showDivider =
          !prev || !isSameLocalDay(entry.createdAt, prev.createdAt);
        const isMine = currentUserId !== undefined && entry.userId === currentUserId;
        return (
          <Fragment key={entry.id}>
            {showDivider && <DayDivider date={entry.createdAt} />}
            <EntryCard
              entry={entry}
              onEdit={isMine ? onEdit : undefined}
              onDelete={isMine ? onDelete : undefined}
              onReactionToggle={async (e, type, next) => {
                // 2026-05-27 (H9): リアクション 3 種化、 isMine でも押下可能 (セルフ労い)。
                // 楽観的更新は該当 type の count / mine のみ反転、 他 type は保持。
                await mutate(
                  (pages) =>
                    pages?.map((page) => ({
                      ...page,
                      entries: page.entries.map((it) => {
                        if (it.id !== e.id) return it;
                        const current = it.reactions ?? {
                          knowledge:    { count: 0, mine: false },
                          appreciation: { count: 0, mine: false },
                          endorsement:  { count: 0, mine: false },
                        };
                        return {
                          ...it,
                          reactions: {
                            ...current,
                            [type]: {
                              count: current[type].count + (next ? 1 : -1),
                              mine: next,
                            },
                          },
                        };
                      }),
                    })),
                  { revalidate: false },
                );
                // API 呼び出し。 成功時は楽観的更新を信じて revalidate しない
                // (revalidate すると ETag 304 で cache 古い値が戻る問題回避)。
                const url = `/api/private/journal/entries/${e.id}/reactions`;
                try {
                  const res = next
                    ? await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ type }),
                      })
                    : await fetch(`${url}?type=${type}`, { method: 'DELETE' });
                  if (!res.ok) await mutate();
                } catch {
                  await mutate();
                }
              }}
            />
          </Fragment>
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
