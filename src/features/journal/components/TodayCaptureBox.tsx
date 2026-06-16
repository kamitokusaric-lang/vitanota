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
import { Globe, Sparkles } from 'lucide-react';
import { useToast } from '@/shared/components/Toast';
import { postStaffroomBoard } from '@/features/staffroom/lib/postStaffroomBoard';
import type { StaffroomBoardKind } from '@/features/staffroom/types';
import type { SuggestKind } from '@/features/ai-chat/kindSuggest';

// note = 一般の公開メモ (旧 tweet/knowledge を集約)。board 4 種は意図つきの共有。
export type CaptureKind = 'note' | StaffroomBoardKind;

const BOARD_KINDS: readonly StaffroomBoardKind[] = ['keep', 'concern', 'thanks', 'help'];

function isBoardKind(kind: CaptureKind): kind is StaffroomBoardKind {
  return (BOARD_KINDS as readonly string[]).includes(kind);
}

// 種別チップ。語彙は「渡す / 共有」に寄せ、評価語を使わない。既定は note (つぶやき)。
// keep/concern は生徒ノート由来とするため職員室ノートの選択肢からは外す。
// 「役に立つ情報」は手動種別をやめ、「なるほど」集計で役に立つ情報箱に集まる (kind 再設計 2026-06-16)。
const KIND_CHIPS: { kind: CaptureKind; label: string }[] = [
  { kind: 'note', label: 'つぶやき' },
  { kind: 'help', label: '確認・相談したいこと' },
  { kind: 'thanks', label: '感謝を伝える' },
];

interface TodayCaptureBoxProps {
  aiChatEnabled?: boolean;
  onSuccess?: () => void;
  // 新規投稿を職員室ノート (右レーン) へ楽観挿入する際、自分の投稿カードに出す表示名。
  // create-mode のみ使用 (編集では使わない)。未指定なら名前は次の再取得で埋まる。
  authorName?: string;
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
  editId,
  initialContent,
  initialKind,
}: TodayCaptureBoxProps) {
  const isEdit = !!editId;
  const { mutate: globalMutate } = useSWRConfig();
  const { showToast } = useToast();
  const [content, setContent] = useState(initialContent ?? '');
  // 初期は無選択 (null)。本人が選ぶか、未選択なら AI がそっと先選択する。投稿時は未選択なら tweet。
  // 編集時は既存 kind を固定表示。
  const [kind, setKind] = useState<CaptureKind | null>(initialKind ?? null);
  // AI が推した種別 (✨ マーク用。null = 提案なし)。
  const [aiPick, setAiPick] = useState<SuggestKind | null>(null);
  const [busy, setBusy] = useState(false);
  const manuallyPickedRef = useRef(false);
  const lastSuggestedRef = useRef('');

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
          setKind(data.suggestedKind); // null なら無選択のまま (投稿時に tweet)
        } catch {
          /* 提案失敗は無視 (無選択のまま = tweet) */
        }
      })();
    }, 600);
    return () => clearTimeout(timer);
  }, [content, aiChatEnabled, isEdit]);

  const handlePickKind = (k: CaptureKind) => {
    manuallyPickedRef.current = true;
    setKind(k);
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
        }
      } else {
        const res = await fetch('/api/private/journal/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: finalKind, content: text, tagIds: [], isPublic: true, mood: null }),
        });
        ok = res.ok;
        if (ok) {
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
      setKind(null);
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
    <div className="space-y-4">
      {/* タイトル下: 全投稿が職員室ノートに公開される旨を明示 (日々ノートと同じ体裁)。 */}
      <div
        className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-100 px-3 py-2.5 text-[13px] font-medium text-amber-800"
        data-testid="capture-public-note"
      >
        <Globe size={15} strokeWidth={2} className="shrink-0" aria-hidden />
        職員室ノートに公開され、校内の先生に共有されます
      </div>

      {/* 種別チップ (最初から表示・初期は無選択)。AI のおすすめは ✨ で示す (未選択時のみ)。 */}
      <div className="flex flex-wrap gap-1.5" data-testid="capture-kinds">
        {KIND_CHIPS.map((c) => {
          const selected = kind === c.kind;
          const isAi = aiPick === c.kind;
          return (
            <button
              key={c.kind}
              type="button"
              onClick={() => handlePickKind(c.kind)}
              disabled={isEdit}
              aria-pressed={selected}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs transition-colors ${
                selected
                  ? 'bg-vn-accent text-white'
                  : 'bg-vn-muted-bg text-slate-500 hover:bg-slate-200'
              } ${isEdit ? 'cursor-default opacity-60' : ''}`}
              data-testid={`capture-kind-${c.kind}`}
            >
              {isAi && (
                <Sparkles
                  size={11}
                  strokeWidth={2}
                  aria-label="AIのおすすめ"
                  className={selected ? 'text-white' : 'text-indigo-500'}
                />
              )}
              {c.label}
            </button>
          );
        })}
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        maxLength={maxLength}
        placeholder="今日の出来事、気づき、ありがとう、相談ごと… 雑に書いて大丈夫。"
        className="w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-vn-accent focus:outline-none"
        data-testid="capture-content-input"
      />
      <div className="-mt-2 text-right text-xs text-gray-400" data-testid="capture-counter">
        {content.length} / {maxLength}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!content.trim() || busy}
          className="rounded-full bg-vn-accent px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          data-testid="capture-submit"
        >
          {isEdit ? '保存' : '書く'}
        </button>
      </div>
    </div>
  );
}
