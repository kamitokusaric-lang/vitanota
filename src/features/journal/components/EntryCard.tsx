// エントリカード: 1件のエントリを表示する共通コンポーネント
// 共有タイムライン・マイ記録の両方で使用
// onEdit / onDelete いずれか指定時は右上に kebab メニュー (⋮) を表示
import { useEffect, useRef, useState } from 'react';
import type { EmotionTag } from '@/db/schema';

export interface EntryCardData {
  id: string;
  userId: string;
  content: string;
  createdAt: string | Date;
  isPublic?: boolean;  // マイ記録では必要、共有タイムラインでは undefined
  authorName?: string | null;  // JOIN 済みの投稿者名 (fallback)
  authorNickname?: string | null;  // nickname 優先表示
  tags?: Array<Pick<EmotionTag, 'id' | 'name' | 'category'>>;
}

interface EntryCardProps {
  entry: EntryCardData;
  showPrivacyBadge?: boolean;
  onEdit?: (entry: EntryCardData) => void;
  onDelete?: (entry: EntryCardData) => void;
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
  onEdit,
  onDelete,
}: EntryCardProps) {
  const hasMenu = Boolean(onEdit || onDelete);

  return (
    <article
      className="rounded-vn border border-vn-border bg-white p-4"
      data-testid={`entry-card-${entry.id}`}
    >
      <header className="mb-2 flex items-start justify-between gap-2 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          {(entry.authorNickname ?? entry.authorName) && (
            <span data-testid={`entry-card-author-${entry.id}`}>
              {entry.authorNickname ?? entry.authorName}
            </span>
          )}
          <time dateTime={new Date(entry.createdAt).toISOString()}>
            {formatDate(entry.createdAt)}
          </time>
        </div>
        <div className="flex items-center gap-2">
          {showPrivacyBadge && entry.isPublic === false && (
            <span
              className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600"
              data-testid={`entry-card-private-${entry.id}`}
            >
              自分だけに保存
            </span>
          )}
          {hasMenu && (
            <EntryCardMenu
              entry={entry}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )}
        </div>
      </header>

      <p
        className="mb-3 whitespace-pre-wrap text-sm text-gray-900"
        data-testid={`entry-card-content-${entry.id}`}
      >
        {entry.content}
      </p>

      {entry.tags && entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.tags.map((tag) => (
            <span
              key={tag.id}
              className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-600"
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

interface EntryCardMenuProps {
  entry: EntryCardData;
  onEdit?: (entry: EntryCardData) => void;
  onDelete?: (entry: EntryCardData) => void;
}

function EntryCardMenu({ entry, onEdit, onDelete }: EntryCardMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        aria-label="メニュー"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={`entry-card-menu-button-${entry.id}`}
      >
        <span aria-hidden="true" className="text-base leading-none">
          ⋮
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 min-w-[96px] overflow-hidden rounded-md border border-gray-200 bg-white shadow-md"
          data-testid={`entry-card-menu-${entry.id}`}
        >
          {onEdit && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onEdit(entry);
              }}
              className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100"
              data-testid={`entry-card-menu-edit-${entry.id}`}
            >
              編集
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDelete(entry);
              }}
              className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50"
              data-testid={`entry-card-menu-delete-${entry.id}`}
            >
              削除
            </button>
          )}
        </div>
      )}
    </div>
  );
}
