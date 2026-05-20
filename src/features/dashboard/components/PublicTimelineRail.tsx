// 右レーン: 公開中の日々ノートを常に視界に出す装置 (chimo 2026-05-20)。
//
// 設計の踏み絵 (project_hidden_theme / project_why_vitanota_exists):
//   - 「先生たちの今日が、 タスクの隣にチラっと見える」 状態を作る
//   - 副産物としてナレッジ・気配が目に入る、 だが読みに行くのは強制しない
//
// レーン内スクロールで全件見れる。 footer リンクは出さない (右レーン自体が日々ノート視界)。
// mood / タグも表示する (chimo 2026-05-20 指示)。 isPublic で本人が公開した投稿のみが
// この経路に乗るので、 mood 露出は本人同意済みコンテンツ範囲内。
//
// API は /api/public/journal/entries?perPage=50 を SWR で 30s 間隔で更新
// (timelineQuerySchema の max は 50)。 CloudFront 側のキャッシュも s-maxage=30 なので、
// 体感は 30-60s 遅延で十分。 50 件超えるテナントが出たら useSWRInfinite で paginate に切替。

import { useState } from 'react';
import useSWR from 'swr';
import { Lightbulb } from 'lucide-react';
import type {
  JournalEntryKind,
  MoodLevel,
} from '@/features/journal/schemas/journal';
import { KIND_META } from '@/features/journal/components/KindBadge';
import { formatRelativeTime } from '@/features/journal/lib/relativeTime';
import { getMoodIcon, getMoodLabel } from '@/features/journal/lib/mood-options';

interface RailEntry {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  mood?: MoodLevel | null;
  kind?: JournalEntryKind;
  authorName?: string | null;
  authorNickname?: string | null;
  tags?: Array<{ id: string; name: string; category?: string | null }>;
  knowledgeTags?: Array<{ id: string; name: string }>;
  knowledgeReactionCount?: number;
  hasMyKnowledgeReaction?: boolean;
}

interface RailResponse {
  entries: RailEntry[];
}

const RAIL_PAGE_SIZE = 50;
const MAX_TAGS_INLINE = 3;

interface PublicTimelineRailProps {
  selfUserId: string;
}

const fetcher = async (url: string): Promise<RailResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as RailResponse;
};

type RailTab = 'staffroom' | 'mine';

export function PublicTimelineRail({ selfUserId }: PublicTimelineRailProps) {
  const [tab, setTab] = useState<RailTab>('staffroom');
  // tab で fetch URL を切り替え (SWR は key 別に独立 cache、 切替時に再 fetch)
  const fetchUrl =
    tab === 'staffroom'
      ? `/api/public/journal/entries?page=1&perPage=${RAIL_PAGE_SIZE}`
      : `/api/private/journal/entries/mine?page=1&perPage=${RAIL_PAGE_SIZE}`;
  const { data, error, isLoading, mutate } = useSWR<RailResponse>(
    fetchUrl,
    fetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    },
  );

  // 楽観的更新パターン (TimelineList と同じ): mutate(更新後 cache, revalidate=false)
  //   → API → 成功時は楽観的更新を信じて revalidate しない (ETag 304 cache 問題回避)
  //   → 失敗時のみ mutate() で正しい状態に戻す
  const toggleKnowledgeReaction = async (entryId: string, next: boolean) => {
    if (!data) return;
    const optimistic: RailResponse = {
      entries: data.entries.map((it) =>
        it.id === entryId
          ? {
              ...it,
              hasMyKnowledgeReaction: next,
              knowledgeReactionCount:
                (it.knowledgeReactionCount ?? 0) + (next ? 1 : -1),
            }
          : it,
      ),
    };
    await mutate(optimistic, { revalidate: false });
    try {
      const res = await fetch(
        `/api/private/journal/entries/${entryId}/knowledge-reaction`,
        { method: next ? 'POST' : 'DELETE' },
      );
      if (!res.ok) await mutate();
    } catch {
      await mutate();
    }
  };

  const emptyMessage =
    tab === 'staffroom'
      ? 'まだ公開された投稿はありません'
      : 'まだ投稿はありません';

  return (
    <aside
      className="sticky top-[104px] flex max-h-[calc(100vh-128px)] flex-col overflow-hidden rounded-[14px] border border-vn-border bg-white shadow-[0_4px_16px_rgba(15,23,42,0.04)]"
      data-testid="public-timeline-rail"
      aria-label="日々ノート (職員室 / マイ 切替)"
    >
      {/* chimo 2026-05-20: 「職員室ノート」 単独 → 「職員室ノート / マイノート」 タブ切替に。
          文字サイズは 16px のまま、 active は下線 indigo + slate-800 / 太字、 non-active は slate-400 */}
      <header
        className="flex items-stretch border-b border-vn-border px-5"
        role="tablist"
      >
        <RailTabButton
          active={tab === 'staffroom'}
          onClick={() => setTab('staffroom')}
          label="職員室ノート"
          testId="public-timeline-rail-tab-staffroom"
        />
        <RailTabButton
          active={tab === 'mine'}
          onClick={() => setTab('mine')}
          label="マイノート"
          testId="public-timeline-rail-tab-mine"
        />
      </header>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="px-5 py-6 text-[13px] text-slate-400">読み込み中</p>
        )}
        {error && (
          <p className="px-5 py-6 text-[13px] text-slate-400">
            読み込みに失敗しました
          </p>
        )}
        {data && data.entries.length === 0 && (
          <p className="px-5 py-6 text-[13px] leading-[1.6] text-slate-400">
            {emptyMessage}
          </p>
        )}
        {data && data.entries.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {data.entries.map((e) => (
              <RailItem
                key={e.id}
                entry={e}
                isMine={e.userId === selfUserId}
                onToggleKnowledge={toggleKnowledgeReaction}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function RailTabButton({
  active,
  onClick,
  label,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      data-testid={testId}
      className={`-mb-px flex-1 pb-3.5 pt-5 text-center text-[16px] leading-[1.4] transition-colors ${
        active
          ? 'border-b-2 border-vn-accent font-bold text-slate-800'
          : 'border-b-2 border-transparent font-medium text-slate-400 hover:text-slate-600'
      }`}
    >
      {label}
    </button>
  );
}

function RailItem({
  entry,
  isMine,
  onToggleKnowledge,
}: {
  entry: RailEntry;
  isMine: boolean;
  onToggleKnowledge: (entryId: string, next: boolean) => void | Promise<void>;
}) {
  const author = entry.authorNickname ?? entry.authorName ?? '';
  const kind = entry.kind ?? 'diary';
  const { Icon: KindIcon, label: kindLabel } = KIND_META[kind];
  const MoodIcon = getMoodIcon(entry.mood);
  const moodLabel = getMoodLabel(entry.mood);
  // 表示タグ: knowledge は knowledgeTags、 それ以外は emotion_tags
  const tagList: Array<{ id: string; name: string }> =
    kind === 'knowledge'
      ? entry.knowledgeTags ?? []
      : entry.tags ?? [];
  const visibleTags = tagList.slice(0, MAX_TAGS_INLINE);
  const overflowCount = Math.max(0, tagList.length - visibleTags.length);
  const reactionCount = entry.knowledgeReactionCount ?? 0;
  const reacted = entry.hasMyKnowledgeReaction ?? false;

  return (
    <li
      className="px-5 py-3.5"
      data-testid={`public-timeline-rail-item-${entry.id}`}
    >
      {/* 1 行目: 投稿者 + 時刻 + kind + mood (EntryCard と同じ順序)
          chimo 2026-05-20 font-tune: 投稿者 600/slate-600、 メタ (時刻) 400/slate-400 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
        <span className="font-semibold text-slate-600">{author}</span>
        <time
          dateTime={new Date(entry.createdAt).toISOString()}
          className="font-normal text-slate-400"
        >
          {formatRelativeTime(entry.createdAt)}
        </time>
        <span className="inline-flex items-center gap-1 rounded-full bg-vn-muted-bg px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
          <KindIcon size={10} strokeWidth={1.75} aria-hidden />
          {kindLabel}
        </span>
        {MoodIcon && (
          <MoodIcon
            size={14}
            className="text-slate-400"
            aria-label={moodLabel ?? 'mood'}
            data-testid={`public-timeline-rail-mood-${entry.id}`}
          />
        )}
      </div>
      {/* 2 行目: content (chimo final-tune: 13px / 400 / slate-700 / line-height 1.7、 読む寄せ) */}
      <p className="mt-1.5 line-clamp-3 text-[13px] font-normal leading-[1.7] text-slate-700">
        {entry.content}
      </p>
      {/* 3 行目: tags + ナレッジボタン (EntryCard と同じ並び) */}
      {(visibleTags.length > 0 || !isMine || reactionCount > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {visibleTags.length > 0 && (
            <span
              className="flex flex-wrap gap-x-2 gap-y-0.5"
              data-testid={`public-timeline-rail-tags-${entry.id}`}
            >
              {visibleTags.map((t) => (
                <span
                  key={t.id}
                  className="text-[11px] font-medium text-slate-500"
                >
                  #{t.name}
                </span>
              ))}
              {overflowCount > 0 && (
                <span className="text-[11px] text-slate-400">
                  +{overflowCount}
                </span>
              )}
            </span>
          )}
          {/* ナレッジリアクション: 自分の投稿には出さない (= 自分には反応しない設計) */}
          {!isMine && (
            <button
              type="button"
              onClick={() => void onToggleKnowledge(entry.id, !reacted)}
              aria-pressed={reacted}
              aria-label="ナレッジ"
              title="ナレッジ"
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
                reacted
                  ? 'bg-vn-accent/10 text-vn-accent'
                  : 'bg-vn-muted-bg text-slate-500 hover:text-slate-700'
              }`}
              data-testid={`public-timeline-rail-knowledge-reaction-${entry.id}`}
            >
              <Lightbulb size={12} strokeWidth={1.75} aria-hidden />
              {reactionCount > 0 && <span>{reactionCount}</span>}
            </button>
          )}
          {/* 自分の投稿でリアクションが付いてるときは「読まれたか」 を控えめに表示 */}
          {isMine && reactionCount > 0 && (
            <span
              className="inline-flex items-center gap-1 text-[11px] text-slate-400"
              data-testid={`public-timeline-rail-knowledge-reaction-count-${entry.id}`}
            >
              <Lightbulb size={12} strokeWidth={1.75} aria-hidden />
              {reactionCount}
            </span>
          )}
        </div>
      )}
    </li>
  );
}
