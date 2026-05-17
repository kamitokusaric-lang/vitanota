// ダッシュボード上部に 1 日表示する「今日のプラン」。
//
// 構成:
//   - 今日やる (Done 前のタスク)
//   - 余裕があれば (Done 前のタスク)
//   - 区切り線
//   - 今日進んだこと (Done されたタスク、古い順)
//
// Done インタラクション (静かに移動):
//   1. □ クリック → ✓ → 取り消し線 + 灰色
//   2. POST /api/ai-chat/today-plan/done
//   3. レスポンスの todayDoneCount で toast 「N つ進みました」(2 秒)
//   4. fade + slide で「今日進んだこと」に移動

import { useEffect, useState } from 'react';
import { TaskEditModal } from '@/features/tasks/components/TaskEditModal';
import { useOnboardingState } from '@/features/onboarding/hooks/useOnboardingState';
import {
  TodayPlanFeedbackHint,
  TODAY_PLAN_FEEDBACK_HINT_VERSION,
} from '@/features/onboarding/TodayPlanFeedbackHint';
import {
  TodayPlanDoneHint,
  TODAY_PLAN_DONE_HINT_VERSION,
} from '@/features/onboarding/TodayPlanDoneHint';
import type { PlanItemView, DoneItemView, OutlookScore } from './types';

interface Props {
  sessionId: string;
  selfUserId: string;
  summary: string;
  today: PlanItemView[];
  optional: PlanItemView[];
  doneItems: DoneItemView[];
  showFeedback: boolean;
  feedbackSubmitting?: boolean;
  onToggleDone: (taskId: string, done: boolean) => Promise<void> | void;
  onSubmitFeedback: (score: OutlookScore) => Promise<void> | void;
  onDismissFeedback: () => void;
  // 編集モーダルでタスクが更新/削除されたら親で plan を再 fetch する
  onTaskMutated?: () => void;
  // 直近の完了通知 (key が変わったら 3 秒間 header に「おつかれさまです」を表示)
  recentDone?: { count: number; key: number } | null;
}

const FEEDBACK_OPTIONS: Array<{ value: OutlookScore; label: string }> = [
  { value: 'held', label: '持てた' },
  { value: 'somewhat', label: '少し持てた' },
  { value: 'difficult', label: 'まだ難しい' },
];

export function TodayPlanView({
  sessionId: _sessionId,
  selfUserId,
  summary,
  today,
  optional,
  doneItems,
  showFeedback,
  feedbackSubmitting,
  onToggleDone,
  onSubmitFeedback,
  onDismissFeedback,
  onTaskMutated,
  recentDone,
}: Props) {
  // header 右端に「おつかれさまです。N つ進みました。」を 3 秒間表示
  // 依存は recentDone.key のみ (新しい key = 新しい完了 = 再表示トリガ)
  const [doneMessageVisible, setDoneMessageVisible] = useState(false);
  useEffect(() => {
    if (!recentDone) return;
    setDoneMessageVisible(true);
    const t = setTimeout(() => setDoneMessageVisible(false), 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentDone?.key]);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  // フィードバックヒント (chimo 2026-05-17): 「AI改善に使うので感想を教えてください」
  const {
    shouldShow: shouldShowFeedbackHint,
    markDismissed: markFeedbackHintDismissed,
  } = useOnboardingState(
    'today_plan_feedback_hint',
    TODAY_PLAN_FEEDBACK_HINT_VERSION,
  );
  const dismissFeedbackHint = (reason: 'close_button' | 'cta_click') => {
    void fetch('/api/ai-chat/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'today_plan_feedback_hint_dismissed',
        reason,
        version: TODAY_PLAN_FEEDBACK_HINT_VERSION,
      }),
    }).catch(() => undefined);
    void markFeedbackHintDismissed(1).catch(() => undefined);
  };

  // 「完了」ボタンヒント (chimo 2026-05-17): 1 番目タスクのみ表示
  const {
    shouldShow: shouldShowDoneHint,
    markDismissed: markDoneHintDismissed,
  } = useOnboardingState(
    'today_plan_done_hint',
    TODAY_PLAN_DONE_HINT_VERSION,
  );
  const dismissDoneHint = (reason: 'close_button' | 'cta_click') => {
    void fetch('/api/ai-chat/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'today_plan_done_hint_dismissed',
        reason,
        version: TODAY_PLAN_DONE_HINT_VERSION,
      }),
    }).catch(() => undefined);
    void markDoneHintDismissed(1).catch(() => undefined);
  };
  // 「今日やる」セクションの 1 番目アイテムの完了ボタンを target にする
  const firstTodayTaskId = today[0]?.taskId ?? null;

  return (
    <section
      data-testid="today-plan-view"
      className="mb-4 rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm"
    >
      <header className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-base font-semibold text-slate-800">今日のプラン</h2>
        {doneMessageVisible && recentDone && (
          <span
            data-testid="today-plan-recent-done-message"
            className="ml-auto text-sm font-medium text-emerald-700"
          >
            おつかれさまです。{recentDone.count} つ進みました。
          </span>
        )}
        {showFeedback && (
          <div
            data-testid="today-plan-feedback-inline"
            className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm shadow-[0_2px_8px_rgba(79,70,229,0.08)]"
          >
            <span className="font-medium text-indigo-800">
              今日の見通しは持てましたか？
            </span>
            {FEEDBACK_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  if (shouldShowFeedbackHint) dismissFeedbackHint('cta_click');
                  void onSubmitFeedback(o.value);
                }}
                disabled={feedbackSubmitting}
                data-testid={`today-plan-feedback-${o.value}`}
                className="h-8 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white shadow-[0_2px_6px_rgba(79,70,229,0.25)] transition hover:-translate-y-0.5 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none disabled:hover:translate-y-0"
              >
                {o.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                if (shouldShowFeedbackHint) dismissFeedbackHint('cta_click');
                onDismissFeedback();
              }}
              disabled={feedbackSubmitting}
              className="ml-1 h-7 w-7 rounded-md text-indigo-400 transition hover:bg-indigo-100 hover:text-indigo-600"
              aria-label="フィードバックを閉じる"
            >
              ×
            </button>
          </div>
        )}
        {showFeedback && shouldShowFeedbackHint && (
          <TodayPlanFeedbackHint
            anchorSelector='[data-testid="today-plan-feedback-inline"]'
            onDismiss={(reason) => dismissFeedbackHint(reason)}
          />
        )}
      </header>
      {summary && (
        <p className="mb-3 text-xs text-slate-500">{summary}</p>
      )}

      <Bucket
        label="今日やる"
        items={today}
        onToggleDone={onToggleDone}
        onOpenDetail={(i) => setEditingTaskId(i.taskId)}
        emptyText="今日やるはまだありません"
        onFirstItemDoneClick={
          shouldShowDoneHint ? () => dismissDoneHint('cta_click') : undefined
        }
      />
      <Bucket
        label="余裕があれば"
        items={optional}
        onToggleDone={onToggleDone}
        onOpenDetail={(i) => setEditingTaskId(i.taskId)}
        emptyText="余裕があればの候補はありません"
      />

      <hr className="my-4 border-slate-200" />

      <h3 className="mb-2 text-xs font-semibold text-slate-600">今日進んだこと</h3>
      {doneItems.length === 0 ? (
        <p className="text-xs text-slate-400">まだありません</p>
      ) : (
        <ul className="space-y-1.5">
          {doneItems.map((d) => (
            <li
              key={d.taskId}
              className="flex items-center gap-3 text-sm text-slate-500"
              data-testid={`today-plan-done-${d.taskId}`}
            >
              <span className="text-green-600">✓</span>
              <span className="flex-1 line-through">{d.title}</span>
              <span className="text-[11px] text-slate-400">
                {formatTime(d.doneAt)}
              </span>
              <button
                type="button"
                onClick={() => void onToggleDone(d.taskId, false)}
                data-testid={`today-plan-done-undo-${d.taskId}`}
                className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-700"
              >
                未完了にする
              </button>
            </li>
          ))}
        </ul>
      )}

      <TaskEditModal
        taskId={editingTaskId}
        selfUserId={selfUserId}
        onClose={() => setEditingTaskId(null)}
        onUpdated={() => onTaskMutated?.()}
        onDeleted={() => onTaskMutated?.()}
      />
      {shouldShowDoneHint && firstTodayTaskId && (
        <TodayPlanDoneHint
          anchorSelector={`[data-testid="today-plan-item-done-${firstTodayTaskId}"]`}
          onDismiss={(reason) => dismissDoneHint(reason)}
        />
      )}
    </section>
  );
}

function Bucket({
  label,
  items,
  onToggleDone,
  onOpenDetail,
  emptyText,
  onFirstItemDoneClick,
}: {
  label: string;
  items: PlanItemView[];
  onToggleDone: Props['onToggleDone'];
  onOpenDetail: (item: PlanItemView) => void;
  emptyText: string;
  // 1 番目タスクの「完了」ボタン押下時に親へ通知 (= done hint dismiss)
  onFirstItemDoneClick?: () => void;
}) {
  // 「余裕があれば」は今日やるの副次的バケット。背景色で視覚的に区別する。
  const isOptional = label === '余裕があれば';
  return (
    <div
      className={'mb-4 ' + (isOptional ? 'rounded-xl bg-amber-100 p-3' : '')}
    >
      <h3 className="mb-2 text-xs font-semibold text-slate-700">{label}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i, idx) => (
            <PlanRow
              key={i.taskId}
              item={i}
              onToggleDone={onToggleDone}
              onOpenDetail={onOpenDetail}
              onBeforeDone={
                idx === 0 ? onFirstItemDoneClick : undefined
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PlanRow({
  item,
  onToggleDone,
  onOpenDetail,
  onBeforeDone,
}: {
  item: PlanItemView;
  onToggleDone: Props['onToggleDone'];
  onOpenDetail: (item: PlanItemView) => void;
  // 完了ボタン押下時、onToggleDone の前に呼ばれる (= done hint の dismiss 用)
  onBeforeDone?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  // fading: Done を押した直後、視覚的に 0.6 秒くらい取り消し線 + fade してから親が再 fetch
  const [fading, setFading] = useState(false);
  // 期限切れ判定: due_date が今日より前なら reason を赤字で目立たせる
  const todayIso = new Date().toISOString().slice(0, 10);
  const isOverdue = !!item.dueDate && item.dueDate < todayIso;

  const handleClick = async () => {
    if (submitting) return;
    onBeforeDone?.();
    setSubmitting(true);
    // 「効いた」感を見せる遅延 → ゆっくり fade → 親が再 fetch (= 約 2 秒の演出)
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    setFading(true);
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    try {
      await onToggleDone(item.taskId, true);
    } finally {
      setSubmitting(false);
      // 視覚的なフェードはこのコンポーネントが unmount される (親の再 fetch)
    }
  };

  return (
    <li
      data-testid={`today-plan-item-${item.taskId}`}
      className={
        'flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 transition-all duration-1000 ' +
        (fading ? 'opacity-50' : '')
      }
    >
      <div className={'flex-1 ' + (fading ? 'line-through text-slate-400' : '')}>
        <button
          type="button"
          onClick={() => onOpenDetail(item)}
          disabled={fading}
          data-testid={`today-plan-item-title-${item.taskId}`}
          className="text-left text-sm font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-2 transition hover:text-indigo-900 hover:decoration-indigo-700 disabled:no-underline disabled:text-slate-400"
        >
          {item.title}
        </button>
        {item.dueDate && (
          <div className="mt-0.5 text-[11px] text-slate-400">
            期限: {item.dueDate}
          </div>
        )}
        {item.reason && (
          <p
            className={
              'mt-1 text-xs leading-relaxed ' +
              (isOverdue ? 'font-medium text-red-600' : 'text-slate-600')
            }
          >
            {item.reason}
          </p>
        )}
        {item.suggestedAction && (
          <p className="mt-0.5 text-xs text-slate-500">
            最初の一歩: {item.suggestedAction}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        data-testid={`today-plan-item-done-${item.taskId}`}
        className={
          'shrink-0 self-center rounded-lg border px-3 py-1.5 text-xs font-medium transition ' +
          (fading
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700')
        }
      >
        {fading ? '✓ 完了' : '完了'}
      </button>
    </li>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
