// タスクの担当者絞込 (chip + popover、Linear 風)
// 全員 / 自分 / 他教員 1 名 を single-select
// 「自分」選択時のみ popover 末尾に「依頼中も表示」checkbox を統合
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
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
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  const others = assignees.filter((a) => a.userId !== selfUserId);
  const selectedOther = others.find((o) => o.userId === value);

  const chipLabel = (() => {
    if (value === undefined) return '全員';
    if (value === selfUserId) return '自分';
    return selectedOther?.name ?? selectedOther?.email ?? '不明';
  })();

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPopoverStyle(null);
      return;
    }
    const r = triggerRef.current.getBoundingClientRect();
    const margin = 16;
    const maxHeight = Math.max(160, window.innerHeight - r.bottom - margin);
    setPopoverStyle({
      position: 'fixed',
      top: r.bottom + 4,
      left: r.left,
      minWidth: Math.max(r.width, 200),
      maxHeight,
      zIndex: 60,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
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
