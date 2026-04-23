// マイ記録一覧（自分の公開・非公開エントリ両方）
// /api/private/journal/entries/mine を取得
import useSWR from 'swr';
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
  page?: number;
  perPage?: number;
  onEdit?: (entry: EntryCardData) => void;
}

export function MyJournalList({
  page = 1,
  perPage = 20,
  onEdit,
}: MyJournalListProps) {
  const { data, error, isLoading } = useSWR(
    `/api/private/journal/entries/mine?page=${page}&perPage=${perPage}`,
    fetcher
  );

  if (isLoading) {
    return (
      <div className="py-10 text-center" data-testid="my-journal-loading">
        <LoadingSpinner label="マイ記録を読み込み中" />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message="マイ記録の取得に失敗しました" />;
  }

  if (!data || data.entries.length === 0) {
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
      {data.entries.map((entry) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          showPrivacyBadge
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}
