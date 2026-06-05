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

import { useEffect, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { jsonFetcher } from '@/shared/lib/fetcher';
import { Sparkles } from 'lucide-react';
import type {
  JournalEntryKind,
  JournalReactionType,
  MoodLevel,
} from '@/features/journal/schemas/journal';
import {
  REACTION_META,
  REACTION_TYPES_ORDER,
} from '@/features/journal/components/reactionMeta';
import type { Reactions } from '@/features/journal/lib/privateJournalRepository';
import { formatRelativeTime } from '@/features/journal/lib/relativeTime';
import { getMoodIcon, getMoodLabel } from '@/features/journal/lib/mood-options';
import { Modal } from '@/shared/components/Modal';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { EntryForm } from '@/features/journal/components/EntryForm';
import type { JournalEntry } from '@/db/schema';

function emptyReactions(): Reactions {
  return {
    knowledge:    { count: 0, mine: false },
    appreciation: { count: 0, mine: false },
    endorsement:  { count: 0, mine: false },
  };
}

interface RailEntry {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  // isPublic はマイノート subtab で自分の非公開エントリを判別するために使う。
  // 職員室ノートでは常に true (= 公開のみ流れる) なので省略可。
  isPublic?: boolean;
  mood?: MoodLevel | null;
  kind?: JournalEntryKind;
  authorName?: string | null;
  authorNickname?: string | null;
  tags?: Array<{ id: string; name: string; category?: string | null }>;
  knowledgeTags?: Array<{ id: string; name: string }>;
  // H9 (2026-05-27): リアクション 3 種類。 自分の投稿でも自分で押せる (セルフ労い)。
  reactions?: Reactions;
  // 投稿者が system_admin ロールを持つ「AI 風」投稿のとき true。 RailItem 側で
  // 別の見た目 (AI 週次日誌 β カード) に切り替える。
  isAiPost?: boolean;
}

interface RailResponse {
  entries: RailEntry[];
}

const RAIL_PAGE_SIZE = 50;
const MAX_TAGS_INLINE = 3;

interface PublicTimelineRailProps {
  selfUserId: string;
  // chimo 2026-05-21: narrow (< xl) 幅ではモーダルで rail を呼び出す。
  // 'modal' 時は sticky / max-h / border / shadow を外し、 Modal の枠に委ねる。
  mode?: 'side' | 'modal';
}

type RailTab = 'staffroom' | 'mine';

// 編集/削除モーダル状態 (chimo 2026-05-21: 旧 TimelineTab から移管。
// 自分の投稿カード右上の 3 点リーダー → 編集 / 削除 を開く)
type RailModalState =
  | { kind: 'closed' }
  | { kind: 'edit'; entryId: string }
  | { kind: 'confirm-delete'; entryId: string };

interface EntryDetailResponse {
  entry: JournalEntry & {
    tags?: Array<{ id: string }>;
    knowledgeTags?: Array<{ id: string }>;
  };
}

export function PublicTimelineRail({
  selfUserId,
  mode = 'side',
}: PublicTimelineRailProps) {
  const [tab, setTab] = useState<RailTab>('staffroom');
  const [modal, setModal] = useState<RailModalState>({ kind: 'closed' });
  const { mutate: globalMutate } = useSWRConfig();
  // tab で fetch URL を切り替え (SWR は key 別に独立 cache、 切替時に再 fetch)
  const fetchUrl =
    tab === 'staffroom'
      ? `/api/public/journal/entries?page=1&perPage=${RAIL_PAGE_SIZE}`
      : `/api/private/journal/entries/mine?page=1&perPage=${RAIL_PAGE_SIZE}`;
  // chimo 2026-05-21: refreshInterval / revalidateOnFocus を無効化。
  // 自動再 fetch が in-flight 古い request の結果で楽観的更新を上書きする
  // race の原因になっていた。 自分の create / edit / delete は楽観的更新で
  // 即時反映、 他教員の更新はページ遷移時 / tab 切替時の再 mount で同期。
  const { data, error, isLoading, mutate } = useSWR<RailResponse>(
    fetchUrl,
    jsonFetcher,
    {
      refreshInterval: 0,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  // 楽観的更新パターン (TimelineList と同じ): mutate(更新後 cache, revalidate=false)
  //   → API → 成功時は楽観的更新を信じて revalidate しない (ETag 304 cache 問題回避)
  //   → 失敗時のみ mutate() で正しい状態に戻す
  // H9 (2026-05-27): reaction 3 種類対応、 該当 type の count / mine のみ反転 (他 type 保持)。
  const toggleReaction = async (
    entryId: string,
    type: JournalReactionType,
    next: boolean,
  ) => {
    if (!data) return;
    const optimistic: RailResponse = {
      entries: data.entries.map((it) => {
        if (it.id !== entryId) return it;
        const current = it.reactions ?? emptyReactions();
        return {
          ...it,
          reactions: {
            ...current,
            [type]: {
              count: current[type].count + (next ? 1 : -1),
              mine: next,
            },
          },
        };
      }),
    };
    await mutate(optimistic, { revalidate: false });
    try {
      const url = `/api/private/journal/entries/${entryId}/reactions`;
      const res =
        next
          ? await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type }),
            })
          : await fetch(`${url}?type=${type}`, { method: 'DELETE' });
      if (!res.ok) await mutate();
    } catch {
      await mutate();
    }
  };

  const emptyMessage =
    tab === 'staffroom'
      ? 'まだ公開された投稿はありません'
      : 'まだ投稿はありません';

  // 編集 / 削除モーダル成功時の楽観的更新 (chimo 2026-05-21: server fetch を
  // 待つと体感ラグが出るうえ、 race で楽観的更新が古い結果で上書きされる)。
  // revalidate: false で勝手に refetch しない (in-flight 古い GET が optimistic を
  // 上書きする race 防止)。 server 最新は 30s refreshInterval / focus で sync。
  const handleModalSuccess = async (
    result?: import('@/features/journal/components/EntryForm').EntrySaveResult,
  ) => {
    // モーダル切替前の操作内容を捕捉 (setModal 後は modal が closed になる)
    const prevModal = modal;
    setModal({ kind: 'closed' });

    const MINE_KEY = `/api/private/journal/entries/mine?page=1&perPage=${RAIL_PAGE_SIZE}`;
    const STAFFROOM_KEY = `/api/public/journal/entries?page=1&perPage=${RAIL_PAGE_SIZE}`;
    type RailCache = RailResponse | undefined;

    if (prevModal.kind === 'edit' && result?.entry) {
      // 編集: 該当エントリを map で同フィールド差し替え
      // (kind / isPublic が変わるケースは server 整形を待つ = 30s revalidate に委ねる)
      const updated = result.entry;
      const updateMatching = (current: RailCache): RailCache => {
        if (!current) return current;
        return {
          ...current,
          entries: current.entries.map((e) =>
            e.id === updated.id
              ? {
                  ...e,
                  content: updated.content,
                  isPublic: updated.isPublic,
                  mood: updated.mood,
                  kind: updated.kind,
                  tags: result.tags,
                }
              : e,
          ),
        };
      };
      void globalMutate(MINE_KEY, updateMatching, { revalidate: false });
      void globalMutate(STAFFROOM_KEY, updateMatching, { revalidate: false });
      return;
    }

    if (prevModal.kind === 'confirm-delete') {
      const deletedId = prevModal.entryId;
      const removeMatching = (current: RailCache): RailCache => {
        if (!current) return current;
        return {
          ...current,
          entries: current.entries.filter((e) => e.id !== deletedId),
        };
      };
      void globalMutate(MINE_KEY, removeMatching, { revalidate: false });
      void globalMutate(STAFFROOM_KEY, removeMatching, { revalidate: false });
      return;
    }

    // フォールバック: 想定外の経路は通常 invalidate のみ
    await globalMutate(
      (key) =>
        typeof key === 'string' &&
        (key.startsWith('/api/private/journal/entries/mine') ||
          key.startsWith('/api/public/journal/entries')),
      undefined,
      { revalidate: true },
    );
  };

  const asideClass =
    mode === 'modal'
      ? 'flex flex-col'
      : 'sticky top-[104px] flex max-h-[calc(100vh-128px)] flex-col overflow-hidden rounded-[14px] border border-vn-border bg-white shadow-[0_4px_16px_rgba(15,23,42,0.04)]';

  return (
    <aside
      className={asideClass}
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
          <p
            className="px-5 py-6 text-[13px] leading-[1.6] text-slate-400"
            data-testid="public-timeline-rail-empty"
          >
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
                onToggleReaction={toggleReaction}
                onEdit={(id) => setModal({ kind: 'edit', entryId: id })}
                onDelete={(id) =>
                  setModal({ kind: 'confirm-delete', entryId: id })
                }
              />
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={modal.kind === 'edit'}
        onClose={() => setModal({ kind: 'closed' })}
        title="今日の出来事を書く"
        maxWidth="max-w-xl"
      >
        {modal.kind === 'edit' && (
          <EditEntryModalBody
            entryId={modal.entryId}
            onSuccess={handleModalSuccess}
            onCancel={() => setModal({ kind: 'closed' })}
          />
        )}
      </Modal>

      <Modal
        open={modal.kind === 'confirm-delete'}
        onClose={() => setModal({ kind: 'closed' })}
        title="記録を削除しますか?"
      >
        {modal.kind === 'confirm-delete' && (
          <ConfirmDeleteModalBody
            entryId={modal.entryId}
            onSuccess={handleModalSuccess}
            onCancel={() => setModal({ kind: 'closed' })}
          />
        )}
      </Modal>
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
  onToggleReaction,
  onEdit,
  onDelete,
}: {
  entry: RailEntry;
  isMine: boolean;
  onToggleReaction: (
    entryId: string,
    type: JournalReactionType,
    next: boolean,
  ) => void | Promise<void>;
  // 編集/削除コールバック (isMine=true のときのみ kebab メニューから発火)
  onEdit: (entryId: string) => void;
  onDelete: (entryId: string) => void;
}) {
  // chimo 2026-05-21: system_admin 兼任アカウントの投稿は AI 週次日誌 β カードとして
  // 描画する。 mood / リアクション / 通常 kind バッジは出さない (踏み絵)。
  // isMine の閲覧時も AI 風カードのまま — 投稿主 (chimo) が「教員にどう見えるか」を
  // 本番 UI で自分で確認できる必要がある。 編集 / 削除は AiPostRailItem 内で
  // 3 点リーダー経由で開ける。
  if (entry.isAiPost) {
    return (
      <AiPostRailItem
        entry={entry}
        isMine={isMine}
        onToggleReaction={onToggleReaction}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );
  }
  const author = entry.authorNickname ?? entry.authorName ?? '';
  const kind = entry.kind ?? 'diary';
  // 2026-05-27 chimo 指示: kind バッジは timeline 表示で意味が伝わらないため非表示
  //   (新仕様で投稿時に kind を選ばないため。 既存 knowledge レコードのタグ表示分岐は維持)。
  const MoodIcon = getMoodIcon(entry.mood);
  const moodLabel = getMoodLabel(entry.mood);
  // 表示タグ: knowledge は knowledgeTags、 それ以外は emotion_tags
  const tagList: Array<{ id: string; name: string }> =
    kind === 'knowledge'
      ? entry.knowledgeTags ?? []
      : entry.tags ?? [];
  const visibleTags = tagList.slice(0, MAX_TAGS_INLINE);
  const overflowCount = Math.max(0, tagList.length - visibleTags.length);
  const reactions = entry.reactions ?? emptyReactions();

  return (
    <li
      className="px-5 py-3.5"
      data-testid={`public-timeline-rail-item-${entry.id}`}
    >
      {/* 1 行目: 投稿者 + 時刻 + kind + mood (左) / 3 点リーダー (右、 isMine のみ)
          chimo 2026-05-20 font-tune: 投稿者 600/slate-600、 メタ (時刻) 400/slate-400 */}
      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <span className="font-semibold text-slate-600">{author}</span>
          <time
            dateTime={new Date(entry.createdAt).toISOString()}
            className="font-normal text-slate-400"
          >
            {formatRelativeTime(entry.createdAt)}
          </time>
          {MoodIcon && (
            <MoodIcon
              size={14}
              className="text-slate-400"
              aria-label={moodLabel ?? 'mood'}
              data-testid={`public-timeline-rail-mood-${entry.id}`}
            />
          )}
        </div>
        {isMine && (
          <div className="flex shrink-0 items-center gap-1.5">
            {entry.isPublic === false && (
              <span
                className="text-[10px] text-slate-400"
                data-testid={`public-timeline-rail-private-${entry.id}`}
              >
                自分のみ
              </span>
            )}
            <RailItemMenu
              entryId={entry.id}
              onEdit={() => onEdit(entry.id)}
              onDelete={() => onDelete(entry.id)}
            />
          </div>
        )}
      </header>
      {/* 2 行目: content (chimo 2026-05-21: 字数制限を廃止して全文表示。 改行も尊重) */}
      <p className="mt-1.5 whitespace-pre-wrap text-[13px] font-normal leading-[1.7] text-slate-700">
        {entry.content}
      </p>
      {/* 3 行目: tags + リアクション 3 ボタン (knowledge / appreciation / endorsement)
          2026-05-27 (H9): 自分の投稿でも 3 ボタン全部表示 + 押下可能 (セルフ労い動線、 chimo 指示)。
          [[feedback_no_ismine_view_branch]] 徹底版: 投稿者・閲覧者で世界観の見え方を分けない。
          reaction セクションは常時表示 (isMine 関係なく)、 chip も常に存在する。 */}
      {visibleTags.length > 0 && (
        <div
          className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5"
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
        </div>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {REACTION_TYPES_ORDER.map((type) => {
          const meta = REACTION_META[type];
          const r = reactions[type];
          const Icon = meta.Icon;
          return (
            <button
              key={type}
              type="button"
              onClick={() => void onToggleReaction(entry.id, type, !r.mine)}
              aria-pressed={r.mine}
              aria-label={meta.ariaLabel}
              className={`group/reaction relative inline-flex h-[30px] items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium transition-colors ${
                r.mine
                  ? 'border-indigo-300 bg-indigo-50 text-vn-accent'
                  : 'border-slate-300 bg-slate-50 text-slate-500 hover:text-slate-700'
              }`}
              data-testid={`public-timeline-rail-reaction-${type}-${entry.id}`}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden />
              {r.count > 0 && <span>{r.count}</span>}
              <span
                role="tooltip"
                className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-[10px] font-normal text-white opacity-0 shadow-md transition-opacity duration-150 group-hover/reaction:opacity-100 group-focus-visible/reaction:opacity-100"
              >
                {meta.label}
              </span>
            </button>
          );
        })}
      </div>
    </li>
  );
}

// AI 週次日誌 β カード (chimo 2026-05-21)
// system_admin 兼任アカウントの投稿だけを別カードとして描画する。
// 通常カードと違う点: 投稿者「vitanota AI」固定、 kind バッジ → 「AI 週次日誌 β」、
// 背景薄紫、 本文 serif。 isMine 編集メニューは出す。
// 2026-05-27 chimo 指示: AI 投稿にも 3 種 reaction を押せるように追加 (通常カードと同じ動線)。
function AiPostRailItem({
  entry,
  isMine,
  onToggleReaction,
  onEdit,
  onDelete,
}: {
  entry: RailEntry;
  isMine: boolean;
  onToggleReaction: (
    entryId: string,
    type: JournalReactionType,
    next: boolean,
  ) => void | Promise<void>;
  onEdit: (entryId: string) => void;
  onDelete: (entryId: string) => void;
}) {
  const reactions = entry.reactions ?? emptyReactions();
  return (
    <li
      className="border-y border-purple-100 bg-purple-50/60 px-5 py-3.5"
      data-testid={`public-timeline-rail-item-${entry.id}`}
      data-ai-post="true"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <span className="font-semibold text-purple-800">vitanota AI</span>
          <time
            dateTime={new Date(entry.createdAt).toISOString()}
            className="font-normal text-purple-400"
          >
            {formatRelativeTime(entry.createdAt)}
          </time>
          <span
            className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700"
            data-testid={`public-timeline-rail-ai-badge-${entry.id}`}
          >
            <Sparkles size={10} strokeWidth={1.75} aria-hidden />
            AI 週次日誌 β
          </span>
        </div>
        {isMine && (
          <div className="flex shrink-0 items-center gap-1.5">
            <RailItemMenu
              entryId={entry.id}
              onEdit={() => onEdit(entry.id)}
              onDelete={() => onDelete(entry.id)}
            />
          </div>
        )}
      </header>
      <p className="mt-2 whitespace-pre-wrap font-ai-card text-[14px] leading-[1.9] text-slate-800">
        {entry.content}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {REACTION_TYPES_ORDER.map((type) => {
          const meta = REACTION_META[type];
          const r = reactions[type];
          const Icon = meta.Icon;
          return (
            <button
              key={type}
              type="button"
              onClick={() => void onToggleReaction(entry.id, type, !r.mine)}
              aria-pressed={r.mine}
              aria-label={meta.ariaLabel}
              className={`group/reaction relative inline-flex h-[30px] items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium transition-colors ${
                r.mine
                  ? 'border-indigo-300 bg-indigo-50 text-vn-accent'
                  : 'border-purple-200 bg-white/70 text-purple-700 hover:bg-white'
              }`}
              data-testid={`public-timeline-rail-reaction-${type}-${entry.id}`}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden />
              {r.count > 0 && <span>{r.count}</span>}
              <span
                role="tooltip"
                className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-[10px] font-normal text-white opacity-0 shadow-md transition-opacity duration-150 group-hover/reaction:opacity-100 group-focus-visible/reaction:opacity-100"
              >
                {meta.label}
              </span>
            </button>
          );
        })}
      </div>
    </li>
  );
}

// 自分の投稿カードの 3 点リーダー (chimo 2026-05-21 復元: 編集/削除導線)。
// testid は旧 EntryCardMenu と同じパターンを踏襲 (E2E selector と互換)。
function RailItemMenu({
  entryId,
  onEdit,
  onDelete,
}: {
  entryId: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
        className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        aria-label="メニュー"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={`entry-card-menu-button-${entryId}`}
      >
        <span aria-hidden="true" className="text-base leading-none">
          ⋮
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 min-w-[96px] overflow-hidden rounded-md border border-slate-200 bg-white shadow-md"
          data-testid={`entry-card-menu-${entryId}`}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-100"
            data-testid={`entry-card-menu-edit-${entryId}`}
          >
            編集
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50"
            data-testid={`entry-card-menu-delete-${entryId}`}
          >
            削除
          </button>
        </div>
      )}
    </div>
  );
}

// 編集モーダル中身 (chimo 2026-05-21: 旧 TimelineTab から移管)。
// 既存 entry の詳細を fetch → EntryForm の mode='edit' に流す。
function EditEntryModalBody({
  entryId,
  onSuccess,
  onCancel,
}: {
  entryId: string;
  onSuccess: () => Promise<void>;
  onCancel: () => void;
}) {
  const { data, error, isLoading } = useSWR(
    `/api/private/journal/entries/${entryId}`,
    jsonFetcher<EntryDetailResponse>,
  );

  if (isLoading) {
    return (
      <div className="py-6 text-center">
        <LoadingSpinner label="読み込み中" />
      </div>
    );
  }
  if (error || !data) {
    return <ErrorMessage message="エントリの取得に失敗しました" />;
  }

  // edit 時の kind 別 tagIds 振り分け:
  //   knowledge → knowledgeTags / それ以外 → tags (emotion_tags)
  const tagIds =
    data.entry.kind === 'knowledge'
      ? data.entry.knowledgeTags?.map((t) => t.id) ?? []
      : data.entry.tags?.map((t) => t.id) ?? [];

  return (
    <EntryForm
      mode="edit"
      kind={data.entry.kind}
      initialData={{
        id: data.entry.id,
        kind: data.entry.kind,
        content: data.entry.content,
        tagIds,
        isPublic: data.entry.isPublic,
        mood: data.entry.mood,
      }}
      onSuccess={onSuccess}
      onCancel={onCancel}
    />
  );
}

// 削除確認モーダル中身 (chimo 2026-05-21: 旧 TimelineTab から移管)
function ConfirmDeleteModalBody({
  entryId,
  onSuccess,
  onCancel,
}: {
  entryId: string;
  onSuccess: () => Promise<void>;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setError(null);
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/private/journal/entries/${entryId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        setError('削除に失敗しました');
        return;
      }
      await onSuccess();
    } catch {
      setError('ネットワークエラーが発生しました');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="confirm-delete-body">
      <p className="text-sm text-slate-700">
        この操作は取り消せません。削除するとタイムラインとマイ記録の両方から消えます。
      </p>
      {error && <ErrorMessage message={error} />}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          data-testid="confirm-delete-cancel-button"
        >
          キャンセル
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={handleConfirm}
          isLoading={isDeleting}
          data-testid="confirm-delete-confirm-button"
        >
          削除する
        </Button>
      </div>
    </div>
  );
}
