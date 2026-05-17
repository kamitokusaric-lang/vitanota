// F3: 教員側 - 過去のフィードバック + 運営返信を表示
// FAB モーダル内 accordion から呼ばれる。返信者表記は一律「運営より」固定。
import { useEffect, useState } from 'react';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';

interface Reply {
  id: string;
  body: string;
  createdAt: string;
}

interface Thread {
  submissionId: string;
  topicTitle: string;
  content: string;
  createdAt: string;
  replyCount: number;
  latestReplyAt: string | null;
  hasUnread: boolean;
  replies: Reply[];
}

interface FeedbackThreadListProps {
  onLoaded?: (info: { threadCount: number; unreadCount: number }) => void;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function FeedbackThreadList({ onLoaded }: FeedbackThreadListProps) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/feedback/my-threads')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? '取得失敗');
        if (cancelled) return;
        setThreads(data.threads);
        onLoaded?.({
          threadCount: data.threads.length,
          unreadCount: data.threads.filter((t: Thread) => t.hasUnread).length,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setError('過去のフィードバックの取得に失敗しました');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // onLoaded は安定参照前提 (親で useCallback 推奨)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <LoadingSpinner size="sm" label="過去のフィードバックを読み込み中" />
      </div>
    );
  }

  if (error) {
    return <div className="py-4 text-center text-sm text-red-600">{error}</div>;
  }

  if (threads.length === 0) {
    return <div className="py-4 text-center text-sm text-gray-400">過去のフィードバックはありません</div>;
  }

  return (
    <ul className="flex flex-col gap-2" data-testid="feedback-thread-list">
      {threads.map((t) => (
        <ThreadItem key={t.submissionId} thread={t} />
      ))}
    </ul>
  );
}

function ThreadItem({ thread: t }: { thread: Thread }) {
  const [open, setOpen] = useState(false);
  const truncated =
    t.content.length > 10 ? t.content.slice(0, 10) + '…' : t.content;

  return (
    <li>
      <details
        className="rounded-md border border-vn-border bg-white"
        onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary
          className="flex cursor-pointer items-start justify-between gap-2 px-3 py-2 text-sm text-gray-700"
          data-testid={`feedback-thread-${t.submissionId}`}
        >
          <span className="flex min-w-0 flex-1 items-start gap-2">
            <span className="whitespace-pre-wrap break-words">
              {open ? t.content : truncated}
            </span>
            <span className="shrink-0 text-xs text-gray-400">
              {formatDateTime(t.createdAt)}
            </span>
          </span>
          {t.replyCount > 0 && (
            <span className="shrink-0 rounded-full bg-vn-muted-bg px-2 py-0.5 text-xs text-gray-600">
              運営から {t.replyCount} 件
            </span>
          )}
        </summary>
        {t.replies.length > 0 && (
          <ul className="flex flex-col gap-2 border-t border-vn-border px-3 py-2">
            {t.replies.map((r) => (
              <li key={r.id} className="rounded-md bg-gray-50 px-3 py-2">
                <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                  <span>運営より</span>
                  <span>{formatDateTime(r.createdAt)}</span>
                </div>
                <div className="whitespace-pre-wrap break-words text-sm text-gray-800">
                  {r.body}
                </div>
              </li>
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}
