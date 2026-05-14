// 「今日の見通しは持てましたか?」フィードバック小モーダル / バナー。
//
// 「この内容で今日を始める」押下から 1 日 1 回、1 件目の Done 直後に出す想定。
// 親で表示タイミングを制御 (submitted や doneCount を見て show を decide)。

import type { OutlookScore } from './types';

interface Props {
  show: boolean;
  onSubmit: (score: OutlookScore) => Promise<void> | void;
  onSkip: () => void;
  submitting?: boolean;
}

const OPTIONS: Array<{ value: OutlookScore; label: string }> = [
  { value: 'held', label: '持てた' },
  { value: 'somewhat', label: '少し持てた' },
  { value: 'difficult', label: 'まだ難しい' },
];

export function MorningPlanFeedback({ show, onSubmit, onSkip, submitting }: Props) {
  if (!show) return null;
  return (
    <div
      data-testid="morning-plan-feedback"
      className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm"
    >
      <p className="font-medium text-slate-800">
        今日の見通しは持てましたか？
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => void onSubmit(o.value)}
            disabled={submitting}
            data-testid={`morning-plan-feedback-${o.value}`}
            className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {o.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onSkip}
          disabled={submitting}
          className="h-10 rounded-xl border border-transparent px-3 text-xs text-slate-400 transition hover:text-slate-600"
        >
          あとで
        </button>
      </div>
    </div>
  );
}
