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
// API は /api/public/journal/entries?perPage=50 を SWR で取得 (timelineQuerySchema の max は 50)。
// fetcher は noStoreJsonFetcher = cache:'no-store' でブラウザ HTTP キャッシュを踏まない。
//   /public は s-maxage/stale-while-revalidate 付きで、素の fetch だとマウント/フルリロード時に
//   ブラウザがキャッシュの stale を返し、新規投稿が出ない (chimo 2026-06-16)。no-store でマウント時は
//   常にサーバ最新を取り、投稿直後の即時反映は create 側の楽観挿入で担保する。
//   50 件超えるテナントが出たら useSWRInfinite で paginate に切替。

import { useEffect, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { noStoreJsonFetcher } from '@/shared/lib/fetcher';
import { Sparkles } from 'lucide-react';
import type {
  JournalEntryKind,
  JournalReactionType,
  MoodLevel,
} from '@/features/journal/schemas/journal';
import { REACTION_TYPES_ORDER } from '@/features/journal/components/reactionMeta';
import { ReactionButton } from '@/features/journal/components/ReactionButton';
import type { Reactions } from '@/features/journal/lib/privateJournalRepository';
import { formatRelativeTime } from '@/features/journal/lib/relativeTime';
import { getMoodIcon, getMoodLabel } from '@/features/journal/lib/mood-options';
import { Modal } from '@/shared/components/Modal';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import {
  TodayCaptureBox,
  type CaptureKind,
} from '@/features/journal/components/TodayCaptureBox';

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
  // 'page' (chimo 2026-06-25): モバイルの独立タブとして全幅表示 (枠なし)。
  mode?: 'side' | 'modal' | 'page';
  // design1 (chimo 2026-06-25): side 幅では rail 上部に投稿フォームをインライン展開。
  // 投稿フォーム (TodayCaptureBox) に渡す値。narrow (modal) では出さない。
  aiChatEnabled?: boolean;
  authorName?: string | null;
  isAiAuthor?: boolean;
}

// 編集/削除モーダル状態 (chimo 2026-05-21: 旧 TimelineTab から移管。
// 自分の投稿カード右上の 3 点リーダー → 編集 / 削除 を開く)
type RailModalState =
  | { kind: 'closed' }
  | { kind: 'edit'; entryId: string; content: string; entryKind: CaptureKind }
  | { kind: 'confirm-delete'; entryId: string };

export function PublicTimelineRail({
  selfUserId,
  mode = 'side',
  aiChatEnabled,
  authorName,
  isAiAuthor,
}: PublicTimelineRailProps) {
  const [modal, setModal] = useState<RailModalState>({ kind: 'closed' });
  const { mutate: globalMutate } = useSWRConfig();

  // 右レーンは職員室ノート (公開タイムライン) 単独。マイノートタブは撤去 (chimo 2026-06-12)。
  const fetchUrl = `/api/public/journal/entries?page=1&perPage=${RAIL_PAGE_SIZE}`;
  // chimo 2026-05-21: refreshInterval / revalidateOnFocus を無効化。
  // 自動再 fetch が in-flight 古い request の結果で楽観的更新を上書きする
  // race の原因になっていた。 自分の create / edit / delete は楽観的更新で
  // 即時反映、 他教員の更新はページ遷移時 / tab 切替時の再 mount で同期。
  const { data, error, isLoading, mutate } = useSWR<RailResponse>(
    fetchUrl,
    noStoreJsonFetcher,
    {
      refreshInterval: 0,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  // 職員室ノート (タイムライン) = 公開 (is_public=true) の全投稿。
  // 公開/私的は is_public が持つ (kind 再設計 2026-06-16)。取得元の公開 view が既に
  // is_public=true のみなので、ここで kind による除外はしない (私的 note はそもそも届かない)。
  const visibleEntries = data?.entries ?? [];

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

  const emptyMessage = 'まだ公開された投稿はありません';

  // 削除成功時の楽観的更新: 該当エントリを職員室ノート cache から除去する
  // (server fetch を待つと体感ラグ + race で楽観的更新が古い結果に上書きされるため)。
  // 編集は TodayCaptureBox 内の refreshFeeds (mutate) に委ねる。
  const handleDeleteSuccess = async (deletedId: string) => {
    setModal({ kind: 'closed' });
    const STAFFROOM_KEY = `/api/public/journal/entries?page=1&perPage=${RAIL_PAGE_SIZE}`;
    type RailCache = RailResponse | undefined;
    void globalMutate(
      STAFFROOM_KEY,
      (current: RailCache): RailCache =>
        current
          ? { ...current, entries: current.entries.filter((e) => e.id !== deletedId) }
          : current,
      { revalidate: false },
    );
  };

  const asideClass =
    mode === 'modal' || mode === 'page'
      ? 'flex flex-col'
      : 'sticky top-[104px] flex max-h-[calc(100vh-128px)] flex-col overflow-hidden rounded-[14px] border border-vn-border bg-white shadow-[0_4px_16px_rgba(15,23,42,0.04)]';

  return (
    <aside
      className={asideClass}
      data-testid="public-timeline-rail"
      aria-label="職員室ノート"
    >
      {/* chimo 2026-07-02: 「職員室ノート」見出しと「今週◯件」表示を撤去。 */}
      {/* design1 (chimo 2026-06-25): rail 上部に職員室ノート投稿フォームをインライン展開。
          side (PC 右レーン) と page (モバイル独立タブ) で表示。modal では出さない。
          chimo 2026-06-26: page は暗いページ背景に直置きで暗く見えたため、他タブ (ふりかえり) と
          同じ bg-vn-surface カードに載せて明るさを揃える。side は白の rail 内なので従来の区切り線。 */}
      {mode !== 'modal' && (
        <div
          className={
            mode === 'page'
              ? 'mx-4 my-4 rounded-[14px] border border-vn-border bg-vn-surface px-5 py-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)]'
              : 'border-b border-vn-border px-5 py-4'
          }
        >
          <TodayCaptureBox
            aiChatEnabled={aiChatEnabled}
            authorName={authorName ?? undefined}
            isAiAuthor={isAiAuthor}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <p className="px-5 py-6 text-[13px] text-slate-400">読み込み中</p>
        )}
        {error && (
          <p className="px-5 py-6 text-[13px] text-slate-400">
            読み込みに失敗しました
          </p>
        )}
        {data && visibleEntries.length === 0 && (
          <p
            className="px-5 py-6 text-[13px] leading-[1.6] text-slate-400"
            data-testid="public-timeline-rail-empty"
          >
            {emptyMessage}
          </p>
        )}
        {data && visibleEntries.length > 0 && (
          <ul className="space-y-3 px-4 py-4">
            {visibleEntries.map((e) => (
              <RailItem
                key={e.id}
                entry={e}
                isMine={e.userId === selfUserId}
                onToggleReaction={toggleReaction}
                onEdit={(en) =>
                  setModal({
                    kind: 'edit',
                    entryId: en.id,
                    content: en.content,
                    entryKind: (en.kind ?? 'note') as CaptureKind,
                  })
                }
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
        title="職員室ノートを編集"
        maxWidth="max-w-xl"
      >
        {modal.kind === 'edit' && (
          <TodayCaptureBox
            editId={modal.entryId}
            initialContent={modal.content}
            initialKind={modal.entryKind}
            onSuccess={() => setModal({ kind: 'closed' })}
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
            onSuccess={() => handleDeleteSuccess(modal.entryId)}
            onCancel={() => setModal({ kind: 'closed' })}
          />
        )}
      </Modal>
    </aside>
  );
}

// カード左の頭文字アバター (chimo 2026-07-02): 色は 1 色 (ニュートラルなグレー) に統一。
// 主役アクセント (オレンジ) を目立たせるため、アバターは意味を持たない静かな地色にする。
function AuthorAvatar({ name }: { name: string }) {
  const trimmed = name?.trim() ?? '';
  const initial = trimmed.charAt(0) || '?';
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[15px] font-bold text-slate-500"
      aria-hidden
    >
      {initial}
    </span>
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
  onEdit: (entry: RailEntry) => void;
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
  // kind バッジは timeline では非表示 (踏み絵)。タグは emotion_tags を表示し、
  // 既存 knowledge レコードの knowledge_tags も残っていれば併せて出す (legacy・新規 note では空)。
  const MoodIcon = getMoodIcon(entry.mood);
  const moodLabel = getMoodLabel(entry.mood);
  const tagList: Array<{ id: string; name: string }> = [
    ...(entry.tags ?? []),
    ...(entry.knowledgeTags ?? []),
  ];
  const visibleTags = tagList.slice(0, MAX_TAGS_INLINE);
  const overflowCount = Math.max(0, tagList.length - visibleTags.length);
  const reactions = entry.reactions ?? emptyReactions();

  return (
    <li
      className="rounded-[16px] border border-vn-border bg-vn-surface px-5 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)]"
      data-testid={`public-timeline-rail-item-${entry.id}`}
    >
      {/* 1 行目: アバター + 投稿者 / 時刻 + mood (左) / 3 点リーダー (右、 isMine のみ)
          chimo 2026-07-02 デザイン刷新: 独立カード + 頭文字アバター + 名前上・時刻下の縦積み。 */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AuthorAvatar name={author} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[15px] font-semibold text-slate-800">
                {author}
              </span>
              {MoodIcon && (
                <MoodIcon
                  size={14}
                  className="shrink-0 text-slate-400"
                  aria-label={moodLabel ?? 'mood'}
                  data-testid={`public-timeline-rail-mood-${entry.id}`}
                />
              )}
            </div>
            <time
              dateTime={new Date(entry.createdAt).toISOString()}
              className="text-[12px] font-normal text-slate-400"
            >
              {formatRelativeTime(entry.createdAt)}
            </time>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isMine && (
            <>
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
                onEdit={() => onEdit(entry)}
                onDelete={() => onDelete(entry.id)}
              />
            </>
          )}
        </div>
      </header>
      {/* 2 行目: content (chimo 2026-05-21: 字数制限を廃止して全文表示。 改行も尊重) */}
      <p className="mt-3 whitespace-pre-wrap text-[14px] font-normal leading-[1.8] text-slate-700">
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
      <div className="mt-2.5 flex flex-wrap items-center gap-x-0.5 gap-y-1.5">
        {REACTION_TYPES_ORDER.map((type) => {
          const r = reactions[type];
          return (
            <ReactionButton
              key={type}
              type={type}
              count={r.count}
              mine={r.mine}
              onToggle={() => void onToggleReaction(entry.id, type, !r.mine)}
              testId={`public-timeline-rail-reaction-${type}-${entry.id}`}
              iconSize={16}
              shapeClass="group/reaction relative inline-flex h-[30px] items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium transition-colors"
              notMineClass="text-slate-500 hover:text-slate-700"
            />
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
  onEdit: (entry: RailEntry) => void;
  onDelete: (entryId: string) => void;
}) {
  const reactions = entry.reactions ?? emptyReactions();
  return (
    <li
      className="rounded-[16px] border border-vn-ai-border bg-vn-ai-bg px-5 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)]"
      data-testid={`public-timeline-rail-item-${entry.id}`}
      data-ai-post="true"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <span className="font-semibold text-vn-ai-text">vitanota AI</span>
          <time
            dateTime={new Date(entry.createdAt).toISOString()}
            className="font-normal text-vn-ink-sub"
          >
            {formatRelativeTime(entry.createdAt)}
          </time>
          <span
            className="inline-flex items-center gap-1 rounded-full bg-vn-ai-border/50 px-2 py-0.5 text-[10px] font-medium text-vn-ai-text"
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
              onEdit={() => onEdit(entry)}
              onDelete={() => onDelete(entry.id)}
            />
          </div>
        )}
      </header>
      <p className="mt-2 whitespace-pre-wrap font-ai-card text-[14px] leading-[1.9] text-slate-800">
        {entry.content}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-0.5 gap-y-1.5">
        {REACTION_TYPES_ORDER.map((type) => {
          const r = reactions[type];
          return (
            <ReactionButton
              key={type}
              type={type}
              count={r.count}
              mine={r.mine}
              onToggle={() => void onToggleReaction(entry.id, type, !r.mine)}
              testId={`public-timeline-rail-reaction-${type}-${entry.id}`}
              iconSize={16}
              shapeClass="group/reaction relative inline-flex h-[30px] items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium transition-colors"
              notMineClass="text-vn-ai-text hover:text-vn-ink"
            />
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
