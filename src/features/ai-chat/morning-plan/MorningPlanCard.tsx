// 「今日の見通しをつくる」入口カード。
// カード全体が 1 つの <button> で、右端にピル風 CTA 表記でボタン感を補強
// (chimo 2026-05-14 提案、「タスクを手動で追加する」のピル形状と統一)。
//
// 設計憲法 (feedback_design_vocab.md): 「整える」を使う、命令しない。

interface Props {
  onClick: () => void;
  disabled?: boolean;
  incompleteTaskCount?: number;
  overdueTaskCount?: number;
  // まだ一度も使ったことがない教員に NEW バッジを出す (= 「初日」感)
  isNew?: boolean;
}

export function MorningPlanCard({
  onClick,
  disabled,
  incompleteTaskCount,
  overdueTaskCount,
  isNew,
}: Props) {
  const hasCount =
    typeof incompleteTaskCount === 'number' && incompleteTaskCount > 0;
  const hasOverdue =
    typeof overdueTaskCount === 'number' && overdueTaskCount > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid="morning-plan-card"
      className={
        'group mb-4 flex w-full items-center justify-between gap-4 rounded-2xl border px-5 py-3 text-left transition hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(79,70,229,0.1)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none ' +
        (isNew
          ? 'border-amber-300 bg-amber-50 hover:border-amber-400 hover:bg-amber-100 disabled:hover:border-amber-300 disabled:hover:bg-amber-50'
          : 'border-indigo-100 bg-indigo-50/40 hover:border-indigo-300 hover:bg-indigo-50 disabled:hover:border-indigo-100 disabled:hover:bg-indigo-50/40')
      }
    >
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          今日の見通しをつくる
          {isNew && (
            <span
              data-testid="morning-plan-card-new-badge"
              className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white"
            >
              NEW
            </span>
          )}
        </h2>
        <p className="mt-0.5 text-xs text-slate-600">
          登録済みタスクから、「今日やること」と「余裕があればやること」を提案します。
          {hasCount && (
            <span className="ml-2 text-[11px] text-slate-400">
              · 未完了 {incompleteTaskCount} 件
              {hasOverdue && (
                <span className="ml-1 font-medium text-amber-700">
                  (うち期限切れ {overdueTaskCount} 件)
                </span>
              )}
            </span>
          )}
        </p>
      </div>
      <span
        aria-hidden="true"
        className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-indigo-300 bg-indigo-50 px-4 text-xs font-bold text-indigo-700 transition group-hover:border-indigo-400 group-hover:bg-indigo-100"
      >
        見通しをつくる
        <span className="transition group-hover:translate-x-0.5">→</span>
      </span>
    </button>
  );
}
