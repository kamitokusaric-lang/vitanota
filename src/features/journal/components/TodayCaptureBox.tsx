// 右サイドの単一入口「職員室ノートに投稿する」。雑に一文を書く → 種別を選んで残す。
// 投稿はすべて職員室ノートに公開 (校内の先生に共有) される。種別はデフォルト tweet (ひとこと)。
// knowledge/keep/concern/thanks/help に切り替えると然るべき場所へ流れる
// (tweet/knowledge=日々ノートの公開投稿、board 4 種=職員室ボード)。どれも職員室ノートに出る。
//
// 起票入口はここに一本化 (chimo 2026-06-12)。職員室ボードからは起票しない。
//
// Slice 2 (chimo 2026-06-13): AI が種別を「そっと提案」する。確認用の別ステップは設けず、
//   書き終えて textarea から離れた時に AI 提案を取得し、該当する種別チップを「✨おすすめ」として
//   そっと先選択する (本人がいつでも変更可。AI は決めない=mood と同原則)。
//   AI off / 失敗時は何もしない (既定 tweet のまま)。入口は常に成立する。
//
// 踏み絵: 種別は分類・評価ではなく「どこへ渡す / どう残す」のルーティング。mood は扱わない (AI 不可触)。
import { useEffect, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import {
  Sparkles,
  MessageCircle,
  Flower2,
  MessagesSquare,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react';
import { useToast } from '@/shared/components/Toast';
import { postStaffroomBoard } from '@/features/staffroom/lib/postStaffroomBoard';
import type { StaffroomBoardKind } from '@/features/staffroom/types';
import type { SuggestKind } from '@/features/ai-chat/kindSuggest';
import { JOURNAL_KIND_META } from '../kindMeta';

// note = 一般の公開メモ (旧 tweet/knowledge を集約)。board 4 種は意図つきの共有。
export type CaptureKind = 'note' | StaffroomBoardKind;

const BOARD_KINDS: readonly StaffroomBoardKind[] = [
  'keep',
  'concern',
  'thanks',
  'help',
  'knowledge',
];

function isBoardKind(kind: CaptureKind): kind is StaffroomBoardKind {
  return (BOARD_KINDS as readonly string[]).includes(kind);
}

// 種別チップ (chimo 2026-07-02 スクショ準拠: テキストのみの pill・アバターがカテゴリ別に変化)。
// keep/concern (生徒系) は生徒ノート由来なので職員室ノート投稿の選択肢からは外す (踏み絵)。
// 気づき/ひとりごとは「つぶやき」(note) に統一 (chimo 2026-06-25)。
//
// ラベルとアイコンは JOURNAL_KIND_META (src/features/journal/kindMeta.ts) が単一正本。
// タイムラインの種別表示と同じ定義を使う (別々に持つとズレる)。
// chipOn = 選択チップの配色 / avatar = 選択時のアバター丸の地色。非選択は CHIP_OFF。
const RAIL_CHIPS: {
  id: string;
  kind: CaptureKind;
  label: string;
  Icon: LucideIcon;
  chipOn: string;
  avatar: string;
  placeholder: string;
}[] = [
  { id: 'note',   kind: 'note',   ...JOURNAL_KIND_META.note,      chipOn: 'border border-vn-blue bg-vn-blue-bg text-vn-blue-text',       avatar: 'bg-vn-blue',   placeholder: '今日の小さな気づき・なるほどは?' },
  { id: 'thanks', kind: 'thanks', ...JOURNAL_KIND_META.thanks,    chipOn: 'border border-vn-pink bg-vn-pink-bg text-vn-pink-text',       avatar: 'bg-vn-pink',   placeholder: '「ありがとう」を伝えたい人や出来事は?' },
  { id: 'help',   kind: 'help',   ...JOURNAL_KIND_META.help,      chipOn: 'border border-vn-accent bg-vn-accent-bg text-vn-accent-text', avatar: 'bg-vn-accent', placeholder: 'ちょっと聞きたい・確認したいこと、ありますか? 雑でOK、まず投げてみましょう。' },
  { id: 'knowledge', kind: 'knowledge', ...JOURNAL_KIND_META.knowledge, chipOn: 'border border-vn-yellow bg-vn-yellow-bg text-vn-yellow-text', avatar: 'bg-vn-yellow', placeholder: '他の先生の役に立ちそうな工夫・やり方・手順は?' },
];

// 非選択チップの配色 (グレー・スクショ準拠)。
const CHIP_OFF = 'border border-vn-border-strong bg-white text-slate-500';

// initialKind / AI 提案 kind → チップ id (現状は kind と 1:1)。
function kindToChipId(k?: CaptureKind | null): string | null {
  if (k === 'help') return 'help';
  if (k === 'thanks') return 'thanks';
  if (k === 'knowledge') return 'knowledge';
  if (k === 'note') return 'note';
  return null; // keep/concern は rail チップに無い
}

interface TodayCaptureBoxProps {
  aiChatEnabled?: boolean;
  onSuccess?: () => void;
  // 新規投稿を職員室ノート (右レーン) へ楽観挿入する際、自分の投稿カードに出す表示名。
  // create-mode のみ使用 (編集では使わない)。未指定なら名前は次の再取得で埋まる。
  authorName?: string;
  // 投稿者が system_admin 兼任 = 右レーンで「vitanota AI」カード表示になる投稿者か。
  // 楽観挿入したカードを投稿直後から AI カードで描くために渡す (サーバ enrich と一致させる)。
  isAiAuthor?: boolean;
  // 編集モード (chimo 2026-06-15): 既存の職員室ノート投稿 (tweet/knowledge + board 4 種) の本文を編集。
  // kind は変更不可 (journal 編集 API が kind を書き換えない) ため、種別チップは選択固定・非活性で
  // 本文だけ PUT する。投稿フォームと見た目を統一するためチップ自体は出す。
  editId?: string;
  initialContent?: string;
  initialKind?: CaptureKind;
}

export function TodayCaptureBox({
  aiChatEnabled = false,
  onSuccess,
  authorName,
  isAiAuthor,
  editId,
  initialContent,
  initialKind,
}: TodayCaptureBoxProps) {
  const isEdit = !!editId;
  const { mutate: globalMutate } = useSWRConfig();
  const { showToast } = useToast();
  const [content, setContent] = useState(initialContent ?? '');
  // 新規はデフォルトで「つぶやき」(note) をアクティブ (chimo 2026-06-25)。
  // 本人が他を選ぶか、AI がそっと提案すれば上書きされる。編集時は既存 kind を固定表示。
  const [chipId, setChipId] = useState<string | null>(
    kindToChipId(initialKind) ?? (editId ? null : 'note'),
  );
  // AI が推した種別 (✨ マーク用。null = 提案なし)。
  const [aiPick, setAiPick] = useState<SuggestKind | null>(null);
  const [busy, setBusy] = useState(false);
  // design1 (chimo 2026-06-25): 入力欄は初期コンパクト、フォーカス/入力中はアニメで展開。
  const [focused, setFocused] = useState(false);
  const manuallyPickedRef = useRef(false);
  const lastSuggestedRef = useRef('');

  // 選択中チップ → kind / プレースホルダー / アバターアイコンを導出。
  const activeChip = chipId ? RAIL_CHIPS.find((c) => c.id === chipId) ?? null : null;
  const kind: CaptureKind | null = activeChip?.kind ?? null;
  // アバターは選択カテゴリのアイコン (未選択時は既定のつぶやきアイコン)。
  const AvatarIcon = activeChip?.Icon ?? MessageCircle;
  const placeholder =
    activeChip?.placeholder ?? 'ひとことどうぞ。雑でOK、まず投げてみましょう。';
  const maxLength = kind && isBoardKind(kind) ? 2000 : 1000;

  // no-store なフィード (マイノート /private・職員室ボード /staffroom) は revalidate で最新化。
  // 公開タイムライン /public は Cache-Control(s-maxage / stale-while-revalidate)で
  // ブラウザ/CDN が stale を返すため revalidate では新規投稿が即時反映されない。
  // create 時は下記 insertIntoPublicTimeline で楽観挿入し、ここでは /public を revalidate しない
  // (revalidate すると stale GET が楽観挿入を上書きするため。編集分岐と同じ理由)。
  const refreshFeeds = () =>
    globalMutate(
      (key: unknown) =>
        typeof key === 'string' &&
        (key.startsWith('/api/private/journal/entries') ||
          key.startsWith('/api/staffroom/board')),
    );

  // 作成したエントリを職員室ノート (右レーン /public) の SWR cache 先頭へ楽観挿入する
  // (revalidate:false でキャッシュ層を bypass。編集/削除と同じパターン)。
  const insertIntoPublicTimeline = (created: {
    id: string;
    userId: string;
    content: string;
    createdAt: string;
    kind: string;
    mood: number | null;
  }) => {
    const optimistic = {
      id: created.id,
      userId: created.userId,
      content: created.content,
      createdAt: created.createdAt,
      isPublic: true,
      mood: created.mood,
      kind: created.kind,
      authorName: authorName ?? null,
      authorNickname: null,
      // system_admin 兼任の投稿は右レーンで AI カード表示。サーバ enrich(isAiPost)と
      // 一致させ、投稿直後から通常カードでチラ見えしないようにする。
      isAiPost: isAiAuthor ?? false,
      tags: [] as Array<{ id: string; name: string }>,
      reactions: {
        knowledge: { count: 0, mine: false },
        appreciation: { count: 0, mine: false },
        endorsement: { count: 0, mine: false },
      },
    };
    type PublicCache = { entries?: unknown[] } | undefined;
    void globalMutate(
      (key: unknown) =>
        typeof key === 'string' && key.startsWith('/api/public/journal/entries'),
      (cur: PublicCache): PublicCache =>
        cur?.entries ? { ...cur, entries: [optimistic, ...cur.entries] } : cur,
      { revalidate: false },
    );
  };

  // 入力が少し止まったら (デバウンス) AI 提案を取得して種別チップをそっと先選択する。
  // blur は「書く」押下と競合して間に合わないため、タイピング中に拾う (chimo 2026-06-13)。
  // 本人が種別を選んでいる時 / 同一本文 / AI off では呼ばない。
  useEffect(() => {
    if (!aiChatEnabled || isEdit || manuallyPickedRef.current) return;
    const text = content.trim();
    if (!text || text === lastSuggestedRef.current) return;
    const timer = setTimeout(() => {
      lastSuggestedRef.current = text;
      void (async () => {
        try {
          const res = await fetch('/api/journal/kind-suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: text }),
          });
          if (!res.ok) return;
          const data = (await res.json()) as { suggestedKind: SuggestKind | null };
          if (manuallyPickedRef.current) return; // 待機中に本人が選んでいたら尊重
          setAiPick(data.suggestedKind);
          setChipId(kindToChipId(data.suggestedKind)); // null なら無選択のまま (投稿時 note)
        } catch {
          /* 提案失敗は無視 (無選択のまま = tweet) */
        }
      })();
    }, 600);
    return () => clearTimeout(timer);
  }, [content, aiChatEnabled, isEdit]);

  const handlePickKind = (id: string) => {
    manuallyPickedRef.current = true;
    setChipId(id);
  };

  const handleSubmit = async () => {
    const text = content.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      // 編集: kind は据え置き (journal 編集 API は kind を書き換えない)。本文だけ PUT する。
      if (isEdit) {
        const res = await fetch(`/api/private/journal/entries/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text }),
        });
        if (!res.ok) {
          showToast('保存に失敗しました', 'error');
          return;
        }
        // 公開タイムライン (/public) は browser cache に当たり revalidate が古い内容を返すため、
        // 該当エントリの本文を楽観的に差し替える (revalidate:false で stale 上書きを防ぐ)。
        void globalMutate(
          (key: unknown) =>
            typeof key === 'string' && key.startsWith('/api/public/journal/entries'),
          (cur: { entries?: Array<{ id: string; content: string }> } | undefined) =>
            cur?.entries
              ? {
                  ...cur,
                  entries: cur.entries.map((e) =>
                    e.id === editId ? { ...e, content: text } : e,
                  ),
                }
              : cur,
          { revalidate: false },
        );
        // マイノート (/mine・no-store) と職員室ボードは revalidate で最新化。
        await globalMutate(
          (key: unknown) =>
            typeof key === 'string' &&
            (key.startsWith('/api/private/journal/entries') ||
              key.startsWith('/api/staffroom/board')),
        );
        showToast('保存しました', 'success');
        onSuccess?.();
        return;
      }
      const finalKind: CaptureKind = kind ?? 'note'; // 未選択は note (つぶやき)
      let ok: boolean;
      // 作成したエントリ (職員室ノートへ楽観挿入する材料)。
      let created:
        | { id: string; userId: string; content: string; createdAt: string; kind: string; mood: number | null }
        | null = null;
      if (isBoardKind(finalKind)) {
        const res = await postStaffroomBoard({ boardKind: finalKind, content: text, isPublic: true });
        ok = res.ok;
        if (ok) {
          // body 解析に失敗しても保存自体は成功 (楽観挿入だけ諦め、次の再取得に委ねる)。
          try {
            const { board } = (await res.json()) as {
              board: { id: string; authorUserId: string; content: string; createdAt: string; boardKind: string };
            };
            created = {
              id: board.id,
              userId: board.authorUserId,
              content: board.content,
              createdAt: board.createdAt,
              kind: board.boardKind,
              mood: null,
            };
          } catch {
            /* 楽観挿入なし */
          }
        }
      } else {
        const res = await fetch('/api/private/journal/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: finalKind, content: text, tagIds: [], isPublic: true, mood: null }),
        });
        ok = res.ok;
        if (ok) {
          // body 解析に失敗しても保存自体は成功 (楽観挿入だけ諦め、次の再取得に委ねる)。
          try {
            const { entry } = (await res.json()) as {
              entry: { id: string; userId: string; content: string; createdAt: string; kind: string; mood: number | null };
            };
            created = {
              id: entry.id,
              userId: entry.userId,
              content: entry.content,
              createdAt: entry.createdAt,
              kind: entry.kind,
              mood: entry.mood ?? null,
            };
          } catch {
            /* 楽観挿入なし */
          }
        }
      }
      if (!ok) {
        showToast('保存に失敗しました', 'error');
        return;
      }
      // 右レーン (公開タイムライン) はキャッシュ層を bypass する楽観挿入で即時反映。
      if (created) insertIntoPublicTimeline(created);
      // マイノート・職員室ボード (no-store) は revalidate で最新化。
      await refreshFeeds();
      setContent('');
      setChipId(null);
      setAiPick(null);
      manuallyPickedRef.current = false;
      lastSuggestedRef.current = '';
      showToast('残しました', 'success');
      onSuccess?.();
    } catch {
      showToast('保存に失敗しました', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* 段1: カテゴリ別アバター (選択カテゴリでアイコン・色が変わる) + 横長インプット。 */}
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-colors ${
            activeChip?.avatar ?? 'bg-vn-accent'
          }`}
          aria-hidden
        >
          <AvatarIcon size={18} strokeWidth={1.75} />
        </span>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={maxLength}
          placeholder={placeholder}
          className={`flex-1 resize-none rounded-[12px] border border-vn-border-strong bg-white px-3.5 py-2.5 text-sm transition-all duration-200 ease-out focus:border-vn-accent focus:outline-none focus:ring-2 focus:ring-vn-accent/20 ${
            focused || content.length > 0 ? 'min-h-[92px]' : 'min-h-[46px]'
          }`}
          data-testid="capture-content-input"
        />
      </div>

      {/* 段2: 種別チップ (テキストのみ・選択=オレンジ/非選択=グレー) + 書くボタン。
          AI のおすすめは ✨ で示す (未選択時のみ)。 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5" data-testid="capture-kinds">
          {RAIL_CHIPS.map((c) => {
            const selected = chipId === c.id;
            const isAi = !isEdit && c.kind === aiPick;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => handlePickKind(c.id)}
                disabled={isEdit}
                aria-pressed={selected}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  selected ? c.chipOn : CHIP_OFF
                } ${isEdit && !selected ? 'opacity-40' : ''} ${isEdit ? 'cursor-default' : ''}`}
                data-testid={`capture-kind-${c.id}`}
              >
                {isAi && (
                  <Sparkles size={11} strokeWidth={2} aria-label="AIのおすすめ" />
                )}
                {c.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!content.trim() || busy}
          className="shrink-0 rounded-full bg-vn-accent px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-vn-accent-hover hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          data-testid="capture-submit"
        >
          {isEdit ? '保存' : '書く'}
        </button>
      </div>
    </div>
  );
}
