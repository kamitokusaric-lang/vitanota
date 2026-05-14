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

import { useState } from 'react';
import {
  TaskDetailDialog,
  type TaskDetailViewModel,
} from './TaskDetailDialog';
import type { PlanItemView, DoneItemView, OutlookScore } from './types';

interface Props {
  sessionId: string;
  summary: string;
  today: PlanItemView[];
  optional: PlanItemView[];
  doneItems: DoneItemView[];
  showFeedback: boolean;
  feedbackSubmitting?: boolean;
  onToggleDone: (taskId: string, done: boolean) => Promise<void> | void;
  onSubmitFeedback: (score: OutlookScore) => Promise<void> | void;
  onDismissFeedback: () => void;
}

const FEEDBACK_OPTIONS: Array<{ value: OutlookScore; label: string }> = [
  { value: 'held', label: '持てた' },
  { value: 'somewhat', label: '少し持てた' },
  { value: 'difficult', label: 'まだ難しい' },
];

function toDetailViewModel(i: PlanItemView): TaskDetailViewModel {
  return {
    title: i.title,
    dueDate: i.dueDate,
    categoryName: i.categoryName,
    status: i.status,
    description: i.description,
    assigneeNames: i.assigneeNames,
    reason: i.reason,
    suggestedAction: i.suggestedAction,
  };
}

export function TodayPlanView({
  sessionId: _sessionId,
  summary,
  today,
  optional,
  doneItems,
  showFeedback,
  feedbackSubmitting,
  onToggleDone,
  onSubmitFeedback,
  onDismissFeedback,
}: Props) {
  const [detail, setDetail] = useState<TaskDetailViewModel | null>(null);

  return (
    <section
      data-testid="today-plan-view"
      className="mb-4 rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm"
    >
      <header className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-base font-semibold text-slate-800">今日のプラン</h2>
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
                onClick={() => void onSubmitFeedback(o.value)}
                disabled={feedbackSubmitting}
                data-testid={`today-plan-feedback-${o.value}`}
                className="h-8 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white shadow-[0_2px_6px_rgba(79,70,229,0.25)] transition hover:-translate-y-0.5 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none disabled:hover:translate-y-0"
              >
                {o.label}
              </button>
            ))}
            <button
              type="button"
              onClick={onDismissFeedback}
              disabled={feedbackSubmitting}
              className="ml-1 h-7 w-7 rounded-md text-indigo-400 transition hover:bg-indigo-100 hover:text-indigo-600"
              aria-label="フィードバックを閉じる"
            >
              ×
            </button>
          </div>
        )}
      </header>
      {summary && (
        <p className="mb-3 text-xs text-slate-500">{summary}</p>
      )}

      <Bucket
        label="今日やる"
        items={today}
        onToggleDone={onToggleDone}
        onOpenDetail={(i) => setDetail(toDetailViewModel(i))}
        emptyText="今日やるはまだありません"
      />
      <Bucket
        label="余裕があれば"
        items={optional}
        onToggleDone={onToggleDone}
        onOpenDetail={(i) => setDetail(toDetailViewModel(i))}
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
                戻す
              </button>
            </li>
          ))}
        </ul>
      )}

      <TaskDetailDialog item={detail} onClose={() => setDetail(null)} />
    </section>
  );
}

function Bucket({
  label,
  items,
  onToggleDone,
  onOpenDetail,
  emptyText,
}: {
  label: string;
  items: PlanItemView[];
  onToggleDone: Props['onToggleDone'];
  onOpenDetail: (item: PlanItemView) => void;
  emptyText: string;
}) {
  return (
    <div className="mb-4">
      <h3 className="mb-2 text-xs font-semibold text-slate-700">{label}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <PlanRow
              key={i.taskId}
              item={i}
              onToggleDone={onToggleDone}
              onOpenDetail={onOpenDetail}
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
}: {
  item: PlanItemView;
  onToggleDone: Props['onToggleDone'];
  onOpenDetail: (item: PlanItemView) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  // fading: Done を押した直後、視覚的に 0.6 秒くらい取り消し線 + fade してから親が再 fetch
  const [fading, setFading] = useState(false);

  const handleClick = async () => {
    if (submitting) return;
    setSubmitting(true);
    setFading(true);
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
        'flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 transition-all duration-500 ' +
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
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
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
