// エントリ表示コンポーネント (共有タイムライン・マイ記録の両方で使用)
// 設計方針 (2026-05-04 chimo): "カードをやめてログに戻す"。Linear 風の
// 静かな hairline 区切り + hover で軽く反応 + 情報を足さない
// onEdit / onDelete いずれか指定時は hover で kebab メニュー (⋮) を表示
import { useEffect, useRef, useState } from 'react';
import type { EmotionTag } from '@/db/schema';
import type {
  JournalEntryKind,
  MoodLevel,
} from '@/features/journal/schemas/journal';
import { Lightbulb } from 'lucide-react';
import { getMoodIcon, getMoodLabel } from '@/features/journal/lib/mood-options';
import { KindBadge } from './KindBadge';

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
  // ナレッジリアクション (= 他の教員が「これはナレッジ」と感じた数 + 自分が ON か)
  knowledgeReactionCount?: number;
  hasMyKnowledgeReaction?: boolean;
}

interface EntryCardProps {
  entry: EntryCardData;
  showPrivacyBadge?: boolean;
  onEdit?: (entry: EntryCardData) => void;
  onDelete?: (entry: EntryCardData) => void;
  // ナレッジリアクション切替 (他人の投稿のみ親から渡す。自分の投稿では undefined)
  onKnowledgeReactionToggle?: (
    entry: EntryCardData,
    next: boolean,
  ) => void | Promise<void>;
}

// Day Divider と組み合わせて使うため時刻のみ表示 (H:mm)
function formatTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function EntryCard({
  entry,
  showPrivacyBadge = false,
  onEdit,
  onDelete,
  onKnowledgeReactionToggle,
}: EntryCardProps) {
  const hasMenu = Boolean(onEdit || onDelete);
  const MoodIcon = getMoodIcon(entry.mood);
  const moodLabel = getMoodLabel(entry.mood);
  const author = entry.authorNickname ?? entry.authorName;

  return (
    <article
      className="group border-b border-vn-border px-3 py-3"
      data-testid={`entry-card-${entry.id}`}
    >
      <header className="flex items-center justify-between gap-2 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <time dateTime={new Date(entry.createdAt).toISOString()}>
            {formatTime(entry.createdAt)}
          </time>
          {entry.kind && <KindBadge kind={entry.kind} />}
          {MoodIcon && (
            <MoodIcon
              size={14}
              className="text-gray-500"
              aria-label={moodLabel ?? 'mood'}
              data-testid={`entry-card-mood-${entry.id}`}
            />
          )}
          {author && (
            <>
              <span aria-hidden className="text-gray-300">·</span>
              <span data-testid={`entry-card-author-${entry.id}`}>
                {author}
              </span>
            </>
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
        className="mt-1 whitespace-pre-wrap text-base text-gray-900"
        data-testid={`entry-card-content-${entry.id}`}
      >
        {entry.content}
      </p>

      {(() => {
        // kind 別にタグを表示: knowledge → knowledgeTags / それ以外 → tags (emotion_tags)
        const displayTags =
          entry.kind === 'knowledge' ? entry.knowledgeTags : entry.tags;
        const hasTags = displayTags && displayTags.length > 0;
        const showReaction = Boolean(onKnowledgeReactionToggle);
        if (!hasTags && !showReaction) return null;
        return (
          <div
            className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"
            data-testid={`entry-card-tags-${entry.id}`}
          >
            {hasTags &&
              displayTags!.map((tag) => (
                <span
                  key={tag.id}
                  className="text-xs font-medium text-gray-500"
                >
                  #{tag.name}
                </span>
              ))}
            {showReaction && (
              <button
                type="button"
                onClick={() =>
                  onKnowledgeReactionToggle!(
                    entry,
                    !entry.hasMyKnowledgeReaction,
                  )
                }
                aria-pressed={entry.hasMyKnowledgeReaction ?? false}
                aria-label="ナレッジ"
                className={`group/reaction relative inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                  entry.hasMyKnowledgeReaction
                    ? 'bg-vn-accent/10 text-vn-accent'
                    : 'bg-vn-muted-bg text-gray-500 hover:text-gray-700'
                }`}
                data-testid={`entry-card-knowledge-reaction-${entry.id}`}
              >
                <Lightbulb size={13} strokeWidth={1.75} aria-hidden />
                {(entry.knowledgeReactionCount ?? 0) > 0 && (
                  <span>{entry.knowledgeReactionCount}</span>
                )}
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-[10px] font-normal text-white opacity-0 shadow-md transition-opacity duration-150 group-hover/reaction:opacity-100 group-focus-within/reaction:opacity-100"
                >
                  ナレッジ
                </span>
              </button>
            )}
          </div>
        );
      })()}
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
