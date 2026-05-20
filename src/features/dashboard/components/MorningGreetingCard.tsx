// 朝カード (H3-B 来訪価値仮説、 project_h3_morning_arrival_value)。
//
// 朝 vitanota を開いた瞬間に、 教員に何も操作を求めずに「来てよかった」 を作る装置。
// 集計ダッシュボードではなく「今日の入口」 として機能する。
//
// 構成 (chimo 2026-05-20、 集計感を避けて温かみ寄せ):
//   - 挨拶 (固定文言)
//   - 状態のひとこと (server-side ルール + 日付シードランダム文言)
//   - 今日まず見るならこのあたり (候補 1-3 件、 タイトル + クリックで詳細)
//   - 安心の一言 (固定)
//   - 閉じる
//
// 昨日完了数は count > 0 のときだけ表示 (0 は強調しない、 朝の責め回避)。
// AI 不使用、 個人傾向不使用、 タップは TaskEditModal を開くのみ。
// 設計憲法 (feedback_design_vocab / feedback_ai_output_guards):
//   命令しない、評価しない、感情代弁しない、軽い語彙、観測されてる感を作らない。

import { useEffect, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChevronDown, ChevronUp, Sparkles, X } from 'lucide-react';
import { TaskEditModal } from '@/features/tasks/components/TaskEditModal';

// chimo 2026-05-20: analytics version key。 構造変更時にインクリメント。
const MORNING_CARD_VERSION = 'v1-2026-05-20';

// 朝カード analytics は `/api/ai-chat/events` 経由で構造化ログに流す (DB 書込なし、 system_admin のみ閲覧)。
// 失敗は静かに無視 (= ユーザー体験を絶対に止めない)。
type MorningCardEventBody =
  | {
      event: 'morning_card_shown';
      version: string;
      candidateCount: number;
      overdueCount: number;
      todayDueCount: number;
      noDueDateCount: number;
      yesterdayDoneCount: number;
    }
  | { event: 'morning_card_dismissed'; version: string }
  | {
      event: 'morning_card_candidate_clicked';
      version: string;
      position: number;
      urgency: Candidate['urgency'];
    }
  | {
      event: 'morning_card_candidate_status_changed';
      version: string;
      position: number;
      urgency: Candidate['urgency'];
      from: string;
      to: string;
    };

function fireMorningCardEvent(body: MorningCardEventBody): void {
  void fetch('/api/ai-chat/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

interface Candidate {
  taskId: string;
  title: string;
  dueDate: string | null;
  status: string;
  urgency: 'overdue' | 'today' | 'soon' | 'in_progress' | 'no_due_date' | 'other';
  urgencyLabel: string;
}

interface MorningCardResponse {
  shouldShow: boolean;
  statusMessage: string;
  reasonMessage: string | null;
  yesterdayDoneMessage: string | null;
  candidates: Candidate[];
  meta: {
    yesterdayDoneCount: number;
    overdueCount: number;
    todayDueCount: number;
    noDueDateCount: number;
  };
}

const fetcher = async (url: string): Promise<MorningCardResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as MorningCardResponse;
};

interface Props {
  selfUserId: string;
}

export function MorningGreetingCard({ selfUserId }: Props) {
  const { data, error, isLoading, mutate } = useSWR<MorningCardResponse>(
    '/api/dashboard/morning-card',
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
  const { mutate: globalMutate } = useSWRConfig();
  const [dismissing, setDismissing] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [movingTaskIds, setMovingTaskIds] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(false);
  // shown event は 1 セッション 1 回のみ発火 (StrictMode 二重 mount にも耐える)
  const shownFiredRef = useRef(false);

  useEffect(() => {
    if (shownFiredRef.current) return;
    if (!data || !data.shouldShow) return;
    shownFiredRef.current = true;
    fireMorningCardEvent({
      event: 'morning_card_shown',
      version: MORNING_CARD_VERSION,
      candidateCount: data.candidates.length,
      overdueCount: data.meta.overdueCount,
      todayDueCount: data.meta.todayDueCount,
      noDueDateCount: data.meta.noDueDateCount,
      yesterdayDoneCount: data.meta.yesterdayDoneCount,
    });
  }, [data]);

  if (isLoading || error || !data || !data.shouldShow) return null;

  const handleDismiss = async () => {
    setDismissing(true);
    fireMorningCardEvent({
      event: 'morning_card_dismissed',
      version: MORNING_CARD_VERSION,
    });
    await mutate({ ...data, shouldShow: false }, { revalidate: false });
    try {
      await fetch('/api/dashboard/morning-card-dismiss', { method: 'POST' });
    } catch {
      // best effort
    }
  };

  // status 変更ボタンの共通ハンドラ。 楽観的更新で candidates から消し、 PATCH 失敗時は再 fetch。
  // TaskBoard 側で対象 status 列に動くので、 朝カードで見た候補が迷子にならない。
  const handleChangeStatus = async (taskId: string, nextStatus: 'todo' | 'done') => {
    const target = data.candidates.find((c) => c.taskId === taskId);
    if (target) {
      const position = data.candidates.findIndex((c) => c.taskId === taskId) + 1;
      fireMorningCardEvent({
        event: 'morning_card_candidate_status_changed',
        version: MORNING_CARD_VERSION,
        position,
        urgency: target.urgency,
        from: target.status,
        to: nextStatus,
      });
    }
    setMovingTaskIds((prev) => new Set(prev).add(taskId));
    await mutate(
      {
        ...data,
        candidates: data.candidates.filter((c) => c.taskId !== taskId),
      },
      { revalidate: false },
    );
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      // タスクボード側の SWR cache (`/api/tasks?...` 系) を invalidate して反映
      await globalMutate(
        (key) => typeof key === 'string' && key.startsWith('/api/tasks'),
        undefined,
        { revalidate: true },
      );
    } catch {
      await mutate();
    } finally {
      setMovingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  return (
    <>
      <section
        className="morning-card-fade-in mt-4 mb-4 rounded-[20px] border border-vn-morning-border bg-vn-morning-bg px-7 pb-3 pt-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
        data-testid="morning-greeting-card"
      >
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-x-3.5 gap-y-1">
              <h2 className="text-[22px] font-bold leading-[1.45] tracking-[-0.01em] text-slate-800">
                おはようございます
              </h2>
              {data.yesterdayDoneMessage && (
                // chimo 2026-05-20: FeedbackUnreadHint (ナビ) と同じ
                // 「pop-in + breath」 アニメ + グラデ pill。 色は indigo→violet で朝カード内の唯一アクセント。
                <span
                  className="morning-yesterday-done-badge inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 px-3 py-1 text-[12px] font-semibold text-white shadow-[0_4px_10px_rgba(79,70,229,0.16)]"
                  data-testid="morning-yesterday-done-badge"
                >
                  <Sparkles size={12} className="text-white" aria-hidden />
                  {data.yesterdayDoneMessage}
                </span>
              )}
            </div>
            <dl className="mb-2 mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <CountChip
                label="期限切れ"
                count={data.meta.overdueCount}
                accent={data.meta.overdueCount > 0 ? 'red' : 'slate'}
              />
              <CountChip
                label="今日が期限"
                count={data.meta.todayDueCount}
                accent={data.meta.todayDueCount > 0 ? 'amber' : 'slate'}
              />
              <CountChip
                label="期限なし"
                count={data.meta.noDueDateCount}
                accent="slate"
              />
            </dl>
            {data.candidates.length > 0 && (
              <div className="mt-2">
                {/* chimo 2026-05-20: max-h overflow-hidden だと 3 件目が見切れたので slice ベースに変更 */}
                <ul className="flex flex-col gap-1.5">
                  {(isExpanded
                    ? data.candidates
                    : data.candidates.slice(0, 2)
                  ).map((c) => {
                    const isMoving = movingTaskIds.has(c.taskId);
                    // backlog → 「今日やる予定」 (todo に動かす)
                    // todo / in_progress / review → 「完了にする」 (done に動かす)
                    const isActive =
                      c.status === 'todo' ||
                      c.status === 'in_progress' ||
                      c.status === 'review';
                    return (
                      <li
                        key={c.taskId}
                        data-testid={`morning-card-candidate-${c.taskId}`}
                        className="grid min-h-[40px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl border border-slate-200/85 bg-white py-1.5 pl-4 pr-3.5"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            fireMorningCardEvent({
                              event: 'morning_card_candidate_clicked',
                              version: MORNING_CARD_VERSION,
                              position: data.candidates.findIndex(
                                (x) => x.taskId === c.taskId,
                              ) + 1,
                              urgency: c.urgency,
                            });
                            setEditingTaskId(c.taskId);
                          }}
                          className="flex min-w-0 items-center gap-2 truncate text-left"
                        >
                          <span className="truncate text-[14px] font-semibold leading-[1.55] text-slate-800 underline decoration-slate-300 decoration-[1px] underline-offset-2 hover:text-slate-900 hover:decoration-slate-500">
                            {c.title}
                          </span>
                          {c.urgencyLabel && (
                            <span
                              className={`ml-2 shrink-0 text-[12px] font-semibold leading-[1.5] ${
                                c.urgency === 'overdue'
                                  ? 'text-red-600'
                                  : c.urgency === 'today'
                                    ? 'text-vn-accent'
                                    : 'text-slate-500'
                              }`}
                            >
                              {c.urgencyLabel}
                              {c.dueDate && (
                                <span className="ml-1 font-medium text-slate-400">
                                  ({c.dueDate})
                                </span>
                              )}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleChangeStatus(c.taskId, isActive ? 'done' : 'todo')
                          }
                          disabled={isMoving}
                          data-testid={
                            isActive
                              ? `morning-card-done-${c.taskId}`
                              : `morning-card-move-${c.taskId}`
                          }
                          className="inline-flex h-[34px] min-w-[112px] shrink-0 items-center justify-center rounded-full border border-indigo-300 bg-indigo-50 px-3.5 text-[12px] font-medium text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isMoving ? '…' : isActive ? '完了にする' : '今日やる予定'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {data.candidates.length > 2 && (
                  // chimo 2026-05-20: 中央寄せ + chevron でクリック可能性を視覚的に示す
                  <div className="mt-1.5 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setIsExpanded((v) => !v)}
                      data-testid="morning-card-expand-toggle"
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[13px] font-medium leading-[1.5] text-slate-600 transition hover:bg-slate-200 hover:text-slate-800"
                    >
                      {isExpanded ? (
                        <>
                          折りたたむ
                          <ChevronUp size={14} strokeWidth={2} aria-hidden />
                        </>
                      ) : (
                        <>
                          他にも候補が {data.candidates.length - 2} 件あります
                          <ChevronDown size={14} strokeWidth={2} aria-hidden />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* chimo 2026-05-21: dismiss 系は slate-100 pill で控えめに (統一ルール: action=indigo / dismiss=slate) */}
          <button
            type="button"
            onClick={handleDismiss}
            disabled={dismissing}
            aria-label="閉じる"
            data-testid="morning-greeting-card-dismiss"
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-slate-100 px-3 text-[12px] font-medium text-slate-600 transition hover:bg-slate-200 hover:text-slate-800 disabled:cursor-not-allowed"
          >
            <X size={14} aria-hidden />
            閉じる
          </button>
        </div>
        {/* chimo 2026-05-21: 朝カード本体の出現アニメ (フワーッと浮かび上がる)、
            + 紫達成バッジの pop-in + breath (FeedbackUnreadHint と同じ式) */}
        <style>{`
          .morning-card-fade-in {
            /* chimo 2026-05-21: 中間 keyframe を撤廃して easing 一発で「ぬるぬる」 補完。
               max-height / margin / padding / border-width が 0 → 値 に連続的に変化することで、
               後続要素 (= タスク追加カード以下) を滑らかに掻き分けて出現する。 */
            /* 最初も最後も上品に、 均一に近い緩やかな S-curve (= mild ease-in-out) で長め duration */
            animation: morning-card-emerge 2.8s cubic-bezier(0.55, 0.05, 0.45, 0.95) both;
            overflow: hidden;
            transform-origin: top;
          }
          @keyframes morning-card-emerge {
            from {
              max-height: 0;
              opacity: 0;
              margin-top: 0;
              margin-bottom: 0;
              padding-top: 0;
              padding-bottom: 0;
              border-top-width: 0;
              border-bottom-width: 0;
              filter: blur(2px);
            }
            to {
              max-height: 900px;
              opacity: 1;
              margin-top: 16px;
              margin-bottom: 16px;
              padding-top: 16px;
              padding-bottom: 12px;
              border-top-width: 1px;
              border-bottom-width: 1px;
              filter: blur(0);
            }
          }
          .morning-yesterday-done-badge {
            animation:
              morning-yesterday-done-pop-in 0.55s cubic-bezier(0.16, 1, 0.3, 1) both,
              morning-yesterday-done-breath 2.6s ease-in-out 0.55s infinite;
            transform-origin: center;
          }
          @keyframes morning-yesterday-done-pop-in {
            0% {
              opacity: 0;
              transform: translateY(4px) scale(0.86);
            }
            55% {
              opacity: 1;
              transform: translateY(-2px) scale(1.06);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          @keyframes morning-yesterday-done-breath {
            0%, 100% {
              transform: translateY(0) scale(1);
            }
            50% {
              transform: translateY(-1px) scale(1.02);
            }
          }
        `}</style>
      </section>

      <TaskEditModal
        taskId={editingTaskId}
        selfUserId={selfUserId}
        onClose={() => setEditingTaskId(null)}
        onUpdated={() => void mutate()}
        onDeleted={() => void mutate()}
      />
    </>
  );
}

function CountChip({
  label,
  count,
  accent,
}: {
  label: string;
  count: number;
  accent: 'red' | 'amber' | 'slate';
}) {
  // chimo 2026-05-20 final-tune: pill + border はボタンっぽく見える →
  //   border / bg を外して inline テキストに、 件数だけ accent 色で強調。
  // chimo 2026-05-21: 今日が期限 (amber) はタスクカードと揃えて vn-accent (青) で統一。
  const countColor =
    accent === 'red'
      ? 'text-rose-600'
      : accent === 'amber'
        ? 'text-vn-accent'
        : 'text-slate-600';
  return (
    <div className="inline-flex items-baseline gap-1 text-[13px] leading-none">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className={`font-bold tabular-nums ${countColor}`}>{count}</dd>
      <span className="text-[11px] font-medium text-slate-400">件</span>
    </div>
  );
}
