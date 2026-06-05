// タスクの担当者絞込 (chip + popover、Linear 風)
// 全員 / 自分 / 他教員 1 名 を single-select
// 「自分」選択時のみ popover 末尾に「依頼中も表示」checkbox を統合
import { usePopover } from '../hooks/usePopover';
import type { Assignee } from '../hooks/useAssignees';

interface AssigneeFilterProps {
  value: string | undefined; // undefined = 全員 / userId = 特定ユーザー
  onChange: (value: string | undefined) => void;
  assignees: Assignee[];
  selfUserId: string;
  showDelegated: boolean;
  onShowDelegatedChange: (next: boolean) => void;
}

export function AssigneeFilter({
  value,
  onChange,
  assignees,
  selfUserId,
  showDelegated,
  onShowDelegatedChange,
}: AssigneeFilterProps) {
  const { open, setOpen, wrapRef, triggerRef, popoverRef, popoverStyle } =
    usePopover();

  const others = assignees.filter((a) => a.userId !== selfUserId);
  const selectedOther = others.find((o) => o.userId === value);

  const chipLabel = (() => {
    if (value === undefined) return '全員';
    if (value === selfUserId) return '自分';
    return selectedOther?.name ?? selectedOther?.email ?? '不明';
  })();


  const handleSelect = (next: string | undefined) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-vn-border-strong bg-white px-[11px] text-[12px] font-medium text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50"
        data-testid="assignee-filter-trigger"
      >
        <span className="font-normal text-slate-500">担当者:</span>
        <span className="font-semibold text-slate-700">{chipLabel}</span>
        <span className="text-slate-400">▼</span>
      </button>

      {open && popoverStyle && (
        <div
          ref={popoverRef}
          className="overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          style={popoverStyle}
          role="dialog"
          aria-label="担当者を選択"
          data-testid="assignee-filter-popover"
        >
          <button
            type="button"
            onClick={() => handleSelect(undefined)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
              value === undefined ? 'bg-gray-50 text-gray-900' : 'text-gray-800 hover:bg-gray-50'
            }`}
            data-testid="assignee-filter-option-all"
          >
            <span className="w-3 text-vn-accent">{value === undefined ? '✓' : ''}</span>
            <span>全員</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelect(selfUserId)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
              value === selfUserId ? 'bg-gray-50 text-gray-900' : 'text-gray-800 hover:bg-gray-50'
            }`}
            data-testid="assignee-filter-option-self"
          >
            <span className="w-3 text-vn-accent">{value === selfUserId ? '✓' : ''}</span>
            <span>自分</span>
          </button>
          {others.map((a) => (
            <button
              key={a.userId}
              type="button"
              onClick={() => handleSelect(a.userId)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                value === a.userId ? 'bg-gray-50 text-gray-900' : 'text-gray-800 hover:bg-gray-50'
              }`}
              data-testid={`assignee-filter-option-${a.userId}`}
            >
              <span className="w-3 text-vn-accent">{value === a.userId ? '✓' : ''}</span>
              <span>{a.name ?? a.email}</span>
            </button>
          ))}
          {value === selfUserId && (
            <>
              <div className="my-1 border-t border-gray-100" />
              <label className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={showDelegated}
                  onChange={(e) => onShowDelegatedChange(e.target.checked)}
                  data-testid="task-board-show-delegated"
                />
                <span>依頼中タスクも表示</span>
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}
