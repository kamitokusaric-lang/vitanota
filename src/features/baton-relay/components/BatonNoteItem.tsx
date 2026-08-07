import { useState } from 'react';
import { Pencil, Trash2, Check, X, Smile, Eye } from 'lucide-react';
import type { BatonNoteDto } from '../types';
import { formatRelativeTime } from '@/features/journal/lib/relativeTime';

interface BatonNoteItemProps {
  note: BatonNoteDto;
  authorName: string;
  isMine: boolean;
  onEdit: (id: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

// その日の印象 1 件。サイン (Good / 気になる) + 任意のコメント。
// サインだけの行 (コメント無し) も出す — 気軽に残せることが狙いなので、
// 「サインだけ」を一人前の記録として描く。
// 自分の行だけ編集/削除できる (著者表示は引き継ぎの可読性のため。採点・貢献ランキング化はしない)。
export function BatonNoteItem({
  note,
  authorName,
  isMine,
  onEdit,
  onDelete,
}: BatonNoteItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === note.content) {
      setEditing(false);
      setDraft(note.content ?? '');
      return;
    }
    setBusy(true);
    try {
      await onEdit(note.id, trimmed);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  // アバターの頭文字は氏名の 1 文字目 (grapheme 単位)。自分も他の先生も同じ見た目 (踏み絵:
  // 世界観を isMine で切り替えない)。氏名はフォーカス / ホバーの tooltip で確認できる。
  const initial = Array.from(authorName)[0] ?? '?';

  return (
    <li className="group flex items-start gap-2 py-1">
      <span className="group/avatar relative mt-0.5 flex-shrink-0">
        <span
          tabIndex={0}
          aria-label={authorName}
          title={authorName}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-vn-muted-bg text-xs font-semibold text-gray-500 focus:outline-none focus:ring-2 focus:ring-vn-accent/40"
        >
          {initial}
        </span>
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover/avatar:opacity-100 group-focus-within/avatar:opacity-100"
        >
          {authorName}
        </span>
      </span>
      <div className="min-w-0 flex-1 rounded-vn bg-vn-muted-bg/50 px-3 py-2">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void save();
                } else if (e.key === 'Escape') {
                  setEditing(false);
                  setDraft(note.content ?? '');
                }
              }}
              maxLength={500}
              autoFocus
              className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-base focus:border-vn-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={save}
              disabled={busy}
              aria-label="保存"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-vn-accent hover:bg-vn-accent/10"
            >
              <Check size={18} />
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(note.content ?? '');
              }}
              aria-label="キャンセル"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-700">
              {note.sign && (
                <span
                  title={note.sign === 'good' ? 'Good' : '気になる'}
                  aria-label={note.sign === 'good' ? 'Good' : '気になる'}
                  className={`mr-1.5 inline-flex align-[-2px] ${
                    note.sign === 'good'
                      ? 'text-vn-green-text'
                      : 'text-vn-warning-text'
                  }`}
                  data-testid={`baton-note-sign-${note.id}`}
                >
                  {note.sign === 'good' ? (
                    <Smile size={14} strokeWidth={2} aria-hidden />
                  ) : (
                    <Eye size={14} strokeWidth={2} aria-hidden />
                  )}
                </span>
              )}
              {note.content ?? (
                <span className="text-gray-400">
                  {note.sign === 'good' ? 'Good' : '気になる'}
                </span>
              )}
            </span>
            <time className="mt-0.5 flex-shrink-0 text-xs text-gray-400">
              {formatRelativeTime(note.createdAt)}
            </time>
            {isMine && (
              <span className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label="編集"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(note.id)}
                  aria-label="削除"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={14} />
                </button>
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
