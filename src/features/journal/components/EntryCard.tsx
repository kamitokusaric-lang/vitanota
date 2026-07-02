// エントリ表示コンポーネント (共有タイムライン・マイ記録の両方で使用)
// 設計方針 (2026-05-04 chimo): "カードをやめてログに戻す"。Linear Updates 風の
// 静かな hairline 区切り + 左にアバター + 相対時刻 + hover メニュー
// onEdit / onDelete いずれか指定時は hover で kebab メニュー (⋮) を表示
import { useEffect, useRef, useState } from 'react';
import type { EmotionTag } from '@/db/schema';
import type {
  JournalEntryKind,
  JournalReactionType,
  MoodLevel,
} from '@/features/journal/schemas/journal';
import {
  REACTION_TYPES_ORDER,
} from '@/features/journal/components/reactionMeta';
import { ReactionButton } from '@/features/journal/components/ReactionButton';
import type { Reactions } from '@/features/journal/lib/privateJournalRepository';
import { getMoodIcon, getMoodLabel } from '@/features/journal/lib/mood-options';
import {
  formatAbsoluteTime,
  formatRelativeTime,
} from '@/features/journal/lib/relativeTime';
import { AuthorAvatar } from './AuthorAvatar';

// アバターは機能 (component / 配色ロジック) を残しつつ、現状は表示しない方針 (chimo)。
// 将来 ON にする時は true にする。flex 構造はこのまま (1 child のみで gap は無効化される)
const SHOW_AVATAR = false;

export interface EntryCardData {
  id: string;
  userId: string;
  content: string;
  createdAt: string | Date;
  isPublic?: boolean;  // マイ記録では必要、共有タイムラインでは undefined
  // mood: 5 段階の気分 (絵文字表示用)。既存データは null、新規投稿は API 側で必須
  mood?: MoodLevel | null;
  // kind: 投稿種別 (migration 0030)。既存データは default 'diary'。
  kind?: JournalEntryKind;
  authorName?: string | null;  // JOIN 済みの投稿者名 (fallback)
  authorNickname?: string | null;  // nickname 優先表示
  // tags: kind=tweet 用 (emotion_tags)
  tags?: Array<Pick<EmotionTag, 'id' | 'name' | 'category'>>;
  // knowledgeTags: kind=knowledge 用 (knowledge_tags、category なし)
  knowledgeTags?: Array<{ id: string; name: string }>;
  // H9 (2026-05-27): リアクション 3 種類 (knowledge / appreciation / endorsement)
  reactions?: Reactions;
}

interface EntryCardProps {
  entry: EntryCardData;
  showPrivacyBadge?: boolean;
  onEdit?: (entry: EntryCardData) => void;
  onDelete?: (entry: EntryCardData) => void;
  // リアクション切替 (2026-05-27 H9: 3 種類フル共存、 isMine でも押下可能なので
  // 親は自分の投稿でも callback を渡す)。 undefined のときはボタン非表示 (旧マイ記録
  // 単独 view 等の互換用)。
  onReactionToggle?: (
    entry: EntryCardData,
    type: JournalReactionType,
    next: boolean,
  ) => void | Promise<void>;
}

export function EntryCard({
  entry,
  showPrivacyBadge = false,
  onEdit,
  onDelete,
  onReactionToggle,
}: EntryCardProps) {
  const hasMenu = Boolean(onEdit || onDelete);
  const MoodIcon = getMoodIcon(entry.mood);
  const moodLabel = getMoodLabel(entry.mood);
  const author = entry.authorNickname ?? entry.authorName;
  const createdAtIso = new Date(entry.createdAt).toISOString();
  const relative = formatRelativeTime(entry.createdAt);
  const absolute = formatAbsoluteTime(entry.createdAt);

  return (
    <article
      className="group flex gap-3 border-b border-vn-border px-3 py-4"
      data-testid={`entry-card-${entry.id}`}
    >
      {SHOW_AVATAR && (
        <AuthorAvatar
          userId={entry.userId}
          name={entry.authorName}
          nickname={entry.authorNickname}
        />
      )}
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-2 text-xs text-gray-500">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {author && (
              <span
                className="font-medium text-gray-700"
                data-testid={`entry-card-author-${entry.id}`}
              >
                {author}
              </span>
            )}
            <time
              dateTime={createdAtIso}
              title={absolute}
              className="text-gray-400"
            >
              {relative}
            </time>
            {/* 2026-05-27 chimo 指示: kind バッジ削除 (新仕様で投稿時に kind 選ばないため) */}
            {MoodIcon && (
              <MoodIcon
                size={14}
                className="text-gray-400"
                aria-label={moodLabel ?? 'mood'}
                data-testid={`entry-card-mood-${entry.id}`}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            {showPrivacyBadge && entry.isPublic === false && (
              <span
                className="text-[10px] text-gray-400"
                data-testid={`entry-card-private-${entry.id}`}
              >
                自分のみ
              </span>
            )}
            {hasMenu && (
              <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <EntryCardMenu
                  entry={entry}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              </div>
            )}
          </div>
        </header>

        <p
          className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed text-gray-900"
          data-testid={`entry-card-content-${entry.id}`}
        >
          {entry.content}
        </p>

        {(() => {
          // タグ表示: emotion_tags + 既存 knowledge_tags があれば併せて (legacy・新規 note では空)。
          const displayTags = [
            ...(entry.tags ?? []),
            ...(entry.knowledgeTags ?? []),
          ];
          const hasTags = displayTags.length > 0;
          const showReactions = Boolean(onReactionToggle);
          if (!hasTags && !showReactions) return null;
          const reactions = entry.reactions;
          return (
            <div
              className="mt-2 flex flex-wrap items-center gap-x-0.5 gap-y-1"
              data-testid={`entry-card-tags-${entry.id}`}
            >
              {hasTags &&
                displayTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="text-xs font-medium text-gray-500"
                  >
                    #{tag.name}
                  </span>
                ))}
              {showReactions &&
                REACTION_TYPES_ORDER.map((type) => {
                  const r = reactions?.[type] ?? { count: 0, mine: false };
                  return (
                    <ReactionButton
                      key={type}
                      type={type}
                      count={r.count}
                      mine={r.mine}
                      onToggle={() => onReactionToggle!(entry, type, !r.mine)}
                      testId={`entry-card-reaction-${type}-${entry.id}`}
                      iconSize={14}
                      shapeClass="group/reaction relative inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors"
                      notMineClass="text-gray-500 hover:text-gray-700"
                    />
                  );
                })}
            </div>
          );
        })()}
      </div>
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
