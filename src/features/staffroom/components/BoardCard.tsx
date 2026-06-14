// 職員室ボードの投稿カード 1 枚 (完全な読み取り専用)。
// 本文 + 文末に投稿者名。リアクション・削除は出さず表示に徹する (chimo 2026-06-13)。
import { Lock } from 'lucide-react';
import type { BoardDto } from '../types';

interface BoardCardProps {
  board: BoardDto;
  nameById: Map<string, string>;
}

export function BoardCard({ board, nameById }: BoardCardProps) {
  const author = (board.authorUserId && nameById.get(board.authorUserId)) || 'ほかの先生';

  return (
    <div className="px-3 py-3.5">
      {/* 本文 + 文末に投稿者名 (薄グレー斜体)。時刻表示は廃止 (chimo 2026-06-13)。
          行間・文字間を広めにとって読みやすく (chimo 2026-06-13)。 */}
      <p className="whitespace-pre-wrap break-words text-sm leading-[1.9] tracking-[0.02em] text-slate-800">
        {board.content}
        <span className="ml-1 text-xs italic text-gray-400">— {author}</span>
      </p>

      {/* 自分だけ(非公開)表示のみ。 */}
      {!board.isPublic && (
        <div className="mt-2">
          <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-400" title="自分だけに表示">
            <Lock size={11} aria-hidden />
            自分だけ
          </span>
        </div>
      )}
    </div>
  );
}
