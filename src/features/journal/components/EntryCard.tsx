// エントリカード: 1件のエントリを表示する共通コンポーネント
// 共有タイムライン・マイ記録の両方で使用
import Link from 'next/link';
import type { Tag } from '@/db/schema';

export interface EntryCardData {
  id: string;
  userId: string;
  content: string;
  createdAt: string | Date;
  isPublic?: boolean;  // マイ記録では必要、共有タイムラインでは undefined
  authorName?: string;  // JOIN 済みの投稿者名
  tags?: Array<Pick<Tag, 'id' | 'name' | 'type' | 'category'>>;
}

interface EntryCardProps {
  entry: EntryCardData;
  showPrivacyBadge?: boolean;
  showEditLink?: boolean;
}

function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function EntryCard({
  entry,
  showPrivacyBadge = false,
  showEditLink = false,
}: EntryCardProps) {
  const contentPreview =
    entry.content.length > 50
      ? `${entry.content.slice(0, 50)}…`
      : entry.content;

  return (
    <article
      className="rounded-vn border border-vn-border bg-white p-4"
      data-testid={`entry-card-${entry.id}`}
    >
      <header className="mb-2 flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-2">
          {entry.authorName && (
            <span data-testid={`entry-card-author-${entry.id}`}>
              {entry.authorName}
            </span>
          )}
          <time dateTime={new Date(entry.createdAt).toISOString()}>
            {formatDate(entry.createdAt)}
          </time>
        </div>
        {showPrivacyBadge && entry.isPublic === false && (
          <span
            className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600"
            data-testid={`entry-card-private-${entry.id}`}
          >
            自分だけに保存
          </span>
        )}
      </header>

      <p
        className="mb-3 whitespace-pre-wrap text-sm text-gray-900"
        data-testid={`entry-card-content-${entry.id}`}
      >
        {contentPreview}
      </p>

      {entry.tags && entry.tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {entry.tags.map((tag) => (
            <span
              key={tag.id}
              className={[
                'rounded-full px-2 py-0.5 text-[10px]',
                tag.type === 'emotion'
                  ? 'bg-pink-50 text-pink-700'
                  : 'bg-gray-100 text-gray-700',
              ].join(' ')}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {showEditLink && (
        <div className="flex justify-end">
          <Link
            href={`/journal/${entry.id}/edit`}
            className="text-xs text-blue-600 hover:underline"
            data-testid={`entry-card-edit-link-${entry.id}`}
          >
            編集
          </Link>
        </div>
      )}
    </article>
  );
}
