// ふりかえりカード上にそっと出す「AIリコメンド」。マイノート詳細 (MyNotesByKind) の
// 非公開ふりかえりカードに差し込む。設計: docs/proposal/retrospective.md §1/§3/§4。
//
// 非対称設計: 気づき(awareness) と 公開用ドラフト(draft) は能動的に出すが、出すかどうかは 100% 本人。
//   ・このまま出す / 直して出す (本文+区分を編集) / 今日はやめておく を常に同じ重さで。
//   ・公開は移動でなくコピー (元のふりかえりは残る)。宛先は category から関数導出 (AI は選ばない)。
//   ・published / dismissed になったら静かに隠す (再ナッジしない)。
import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Sparkles, Send, Pencil, X } from 'lucide-react';
import { useToast } from '@/shared/components/Toast';
import { postStaffroomBoard } from '@/features/staffroom/lib/postStaffroomBoard';
import {
  categoryToBoardKind,
  type RetroCategory,
  type RetroRecommendResult,
} from '@/features/journal/recommend/recommendSchema';

interface RetroRecommendationProps {
  entryId: string;
  // ふりかえりの原文。つぶやきの「出してみる」はこれを初期値にする (素のまま軽く直して出す)。
  entryContent: string;
}

interface GetResponse {
  recommendation: RetroRecommendResult | null;
  status: 'proposed' | 'published' | 'dismissed' | null;
}

const CATEGORY_LABEL: Record<RetroCategory, string> = {
  soudan: '相談',
  kansha: '感謝',
  knowledge: 'ナレッジ',
  tweet: 'つぶやき',
};

const CATEGORY_PILL: Record<RetroCategory, string> = {
  soudan: 'bg-vn-accent-bg text-vn-accent-text',
  kansha: 'bg-vn-pink-bg text-vn-pink-text',
  knowledge: 'bg-vn-yellow-bg text-vn-yellow-text',
  tweet: 'bg-vn-blue-bg text-vn-blue-text',
};

const EDIT_CATEGORY_ORDER: RetroCategory[] = ['soudan', 'kansha', 'knowledge', 'tweet'];

// POST で「計算 or キャッシュ取得」(idempotent)。保存時 fire-and-forget の取りこぼしも救済する。
// 404 (フラグ off) / 429 / 503 は静かに null 扱い (機能の存在を悟らせない / 何も出さない)。
async function fetchRecommendation(entryId: string): Promise<GetResponse> {
  try {
    const res = await fetch('/api/journal/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId }),
    });
    if (!res.ok) return { recommendation: null, status: null };
    return (await res.json()) as GetResponse;
  } catch {
    return { recommendation: null, status: null };
  }
}

export function RetroRecommendation({ entryId, entryContent }: RetroRecommendationProps) {
  const { data, mutate } = useSWR<GetResponse>(
    ['retro-recommend', entryId],
    () => fetchRecommendation(entryId),
    { revalidateOnFocus: false },
  );
  const { mutate: globalMutate } = useSWRConfig();
  const { showToast } = useToast();

  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [editInitial, setEditInitial] = useState(''); // 編集を開いたときの初期値 (編集有無の判定用)
  const [editCategory, setEditCategory] = useState<RetroCategory>('tweet');
  const [busy, setBusy] = useState(false);

  const rec = data?.recommendation;
  // 出す価値あり (surface) かつ 未対応 (proposed) のときだけ出す。
  if (!rec || !rec.surface || data?.status !== 'proposed') return null;

  const proposedCategory: RetroCategory = rec.primary?.category ?? 'tweet';

  const refreshFeeds = () =>
    globalMutate(
      (key: unknown) =>
        typeof key === 'string' &&
        (key.startsWith('/api/public/journal/entries') ||
          key.startsWith('/api/staffroom/board')),
    );

  async function publish(draft: string, category: RetroCategory, bodyChanged: boolean) {
    const text = draft.trim();
    if (!text) {
      showToast('内容を入力してください', 'error');
      return;
    }
    setBusy(true);
    try {
      let ok = false;
      if (category === 'tweet') {
        const res = await fetch('/api/private/journal/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'note',
            content: text,
            tagIds: [],
            isPublic: true,
            mood: null,
          }),
        });
        ok = res.ok;
      } else {
        const boardKind = categoryToBoardKind(category);
        if (!boardKind) return;
        const res = await postStaffroomBoard({ boardKind, content: text, isPublic: true });
        ok = res.ok;
      }
      if (!ok) {
        showToast('公開に失敗しました', 'error');
        return;
      }
      // 対応状態を published に + 計測 (転換率/編集率)。元のふりかえりは触らない (= コピー)。
      await fetch('/api/journal/recommend', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, status: 'published', finalCategory: category, bodyChanged }),
      });
      showToast('出しました', 'success');
      await mutate();
      void refreshFeeds();
    } catch {
      showToast('公開に失敗しました', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function dismiss() {
    setBusy(true);
    try {
      await fetch('/api/journal/recommend', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, status: 'dismissed' }),
      });
      await mutate();
    } catch {
      showToast('うまくいきませんでした', 'error');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(initialDraft: string, initialCategory: RetroCategory) {
    setEditDraft(initialDraft);
    setEditInitial(initialDraft);
    setEditCategory(initialCategory);
    setEditing(true);
  }

  // ── 編集モード (直して出す): 本文 + 区分を本人が決める ──
  if (editing) {
    const bodyChanged = editDraft.trim() !== editInitial.trim();
    return (
      <div
        className="mt-3 rounded-[10px] border border-vn-accent/30 bg-vn-accent-bg/30 p-3"
        data-testid={`retro-recommend-edit-${entryId}`}
      >
        <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="出す先の区分">
          {EDIT_CATEGORY_ORDER.map((c) => {
            const selected = editCategory === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setEditCategory(c)}
                aria-pressed={selected}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selected ? CATEGORY_PILL[c] : 'bg-white text-slate-500 hover:bg-slate-100'
                }`}
                data-testid={`retro-edit-category-${c}`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            );
          })}
        </div>
        <textarea
          value={editDraft}
          onChange={(e) => setEditDraft(e.target.value)}
          rows={3}
          placeholder={
            editCategory === 'tweet'
              ? '素のまま、ひとことで。'
              : '出す文面を整えましょう。'
          }
          className="w-full resize-none rounded-md border border-vn-border-strong bg-white px-3 py-2 text-sm focus:border-vn-accent focus:outline-none focus:ring-2 focus:ring-vn-accent/20"
          data-testid={`retro-edit-draft-${entryId}`}
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
          >
            <X size={13} aria-hidden />
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => publish(editDraft, editCategory, bodyChanged)}
            disabled={busy || !editDraft.trim()}
            className="inline-flex items-center gap-1 rounded-full bg-vn-accent px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-vn-accent-hover disabled:bg-slate-200 disabled:text-slate-400"
            data-testid={`retro-edit-submit-${entryId}`}
          >
            <Send size={13} aria-hidden />
            つぶやく
          </button>
        </div>
      </div>
    );
  }

  // ── 提示モード (全区分共通 UI) ──
  // つぶやきは原文を、相談/感謝/ナレッジは AI ドラフトを、同じプレビュー枠で見せる。
  if (!rec.primary && !rec.tweet) return null;
  const postCategory: RetroCategory = rec.primary ? rec.primary.category : 'tweet';
  const postText = rec.primary ? rec.primary.draft : entryContent;
  const headline = rec.primary ? rec.primary.awareness : (rec.tweet?.nudge ?? '');

  return (
    <div
      className="mt-3 rounded-xl border border-vn-accent/40 bg-vn-accent-bg/60 p-3.5 shadow-[0_2px_10px_rgba(232,105,74,0.08)]"
      data-testid={`retro-recommend-${entryId}`}
    >
      {/* 気づき + 職員室ノートへの投稿を明示的に促す (chimo 2026-07-01: 目立たせる)。 */}
      <div className="mb-2.5 flex items-start gap-2">
        <Sparkles size={16} className="mt-0.5 shrink-0 text-vn-accent" aria-hidden />
        <div>
          {headline && (
            <p className="text-sm font-medium leading-relaxed text-slate-800">{headline}</p>
          )}
          <p className="mt-0.5 text-sm font-semibold text-vn-accent-text">
            職員室ノートにも投稿しませんか?
          </p>
        </div>
      </div>

      {/* 出す文面のプレビュー (全区分共通)。つぶやきは原文、他は AI ドラフト。 */}
      <div className="rounded-md border border-vn-border bg-white px-3 py-2.5">
        <div className="mb-1 flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_PILL[postCategory]}`}
          >
            {CATEGORY_LABEL[postCategory]}
          </span>
          {rec.primary?.meta.title && (
            <span className="text-xs font-semibold text-slate-600">
              {rec.primary.meta.title}
            </span>
          )}
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{postText}</p>
        {rec.primary?.meta.points && rec.primary.meta.points.length > 0 && (
          <ul className="mt-1.5 list-inside list-disc text-xs text-slate-500">
            {rec.primary.meta.points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
        {rec.primary?.meta.recipientHint && (
          <p className="mt-1.5 text-[11px] text-slate-400">宛先: {rec.primary.meta.recipientHint}</p>
        )}
      </div>

      {/* アクション: 見送りを一級市民に (常に同じ重さで提示)。全区分同じ 3 ボタン。 */}
      <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={dismiss}
          disabled={busy}
          className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
          data-testid={`retro-dismiss-${entryId}`}
        >
          今日はやめておく
        </button>
        <button
          type="button"
          onClick={() => startEdit(postText, postCategory)}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-full border border-vn-accent/40 px-3 py-1.5 text-xs font-medium text-vn-accent-text hover:bg-vn-accent-bg/50"
          data-testid={`retro-edit-${entryId}`}
        >
          <Pencil size={12} aria-hidden />
          修正してつぶやく
        </button>
        <button
          type="button"
          onClick={() => publish(postText, postCategory, false)}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-full bg-vn-accent px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-vn-accent-hover disabled:bg-slate-200 disabled:text-slate-400"
          data-testid={`retro-publish-${entryId}`}
        >
          <Send size={12} aria-hidden />
          このままつぶやく
        </button>
      </div>
    </div>
  );
}
