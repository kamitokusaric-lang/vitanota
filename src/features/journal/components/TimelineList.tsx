// US-T-014: 共有タイムライン表示
// /api/public/journal/entries を SWR で取得
// mutate() による再検証で投稿直後の更新を反映
import useSWR from 'swr';
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

interface TimelineListProps {
  page?: number;
  perPage?: number;
}

export function TimelineList({
  page = 1,
  perPage = 20,
}: TimelineListProps) {
  const { data, error, isLoading } = useSWR(
    `/api/public/journal/entries?page=${page}&perPage=${perPage}`,
    fetcher,
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  );

  if (isLoading) {
    return (
      <div className="py-10 text-center" data-testid="timeline-list-loading">
        <LoadingSpinner label="タイムラインを読み込み中" />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message="タイムラインの取得に失敗しました" />;
  }

  if (!data || data.entries.length === 0) {
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
      {data.entries.map((entry) => (
        <EntryCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
