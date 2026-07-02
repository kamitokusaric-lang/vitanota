// 職員室ノート投稿の「右側の吹き出し」コメント (chimo 2026-07-02 「4a 吹き出し型」)。
// 縦に積まず投稿の余白に会話が育つイメージ。コメント本体 (相互関心の共感・対話) のみ。
// 踏み絵: コメントへのリアクション・スレッド・件数の採点はしない。削除は本人 or school_admin。
import { useState } from 'react';
import { AuthorAvatar } from './AuthorAvatar';
import { formatRelativeTime } from '../lib/relativeTime';

export interface ThreadComment {
  id: string;
  userId: string | null;
  authorName?: string | null;
  authorNickname?: string | null;
  body: string;
  createdAt: string;
}

interface JournalCommentThreadProps {
  entryId: string;
  comments: ThreadComment[];
  selfUserId: string;
  // school_admin は誰のコメントでも削除できる
  canModerate: boolean;
  onAdd: (entryId: string, body: string) => void | Promise<void>;
  onDelete: (entryId: string, commentId: string) => void | Promise<void>;
}

export function JournalCommentThread({
  entryId,
  comments,
  selfUserId,
  canModerate,
  onAdd,
  onDelete,
}: JournalCommentThreadProps) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      await onAdd(entryId, body);
      setDraft('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2" data-testid={`journal-comments-${entryId}`}>
      {comments.map((c) => {
        const name = c.authorNickname ?? c.authorName ?? 'ほかの先生';
        const canDelete =
          canModerate || (c.userId != null && c.userId === selfUserId);
        return (
          <div
            key={c.id}
            className="group/comment rounded-[14px] bg-vn-muted-bg/50 px-3 py-2"
            data-testid={`journal-comment-${c.id}`}
          >
            <div className="flex items-center gap-2">
              <AuthorAvatar
                userId={c.userId ?? 'unknown'}
                name={c.authorName}
                nickname={c.authorNickname}
                size={22}
              />
              <span className="min-w-0 truncate text-[12px] font-semibold text-slate-700">
                {name}
              </span>
              <time className="shrink-0 text-[11px] text-slate-400">
                {formatRelativeTime(c.createdAt)}
              </time>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(entryId, c.id)}
                  aria-label="コメントを削除"
                  className="ml-auto shrink-0 text-[11px] text-slate-300 opacity-0 transition-colors hover:text-red-500 group-hover/comment:opacity-100 group-focus-within/comment:opacity-100"
                  data-testid={`journal-comment-delete-${c.id}`}
                >
                  削除
                </button>
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-[1.7] text-slate-700">
              {c.body}
            </p>
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="コメントする"
          maxLength={2000}
          className="min-w-0 flex-1 rounded-full border border-vn-border bg-white px-3.5 py-1.5 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-vn-accent focus:outline-none"
          data-testid={`journal-comment-input-${entryId}`}
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !draft.trim()}
          className="shrink-0 rounded-full bg-vn-accent px-4 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-vn-accent-hover disabled:opacity-40"
          data-testid={`journal-comment-submit-${entryId}`}
        >
          送る
        </button>
      </div>
    </div>
  );
}
