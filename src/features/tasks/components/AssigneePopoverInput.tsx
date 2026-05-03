// 複数担当者の選択 UI: input 風 box (選択中 chip 並び + ▼) と popover チェック一覧
// table 内などで使ったときに親の overflow に切られないよう、popover は position:fixed で配置
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

export interface AssigneeCandidate {
  userId: string;
  label: string;
}

interface AssigneePopoverInputProps {
  candidates: AssigneeCandidate[];
  selectedUserIds: string[];
  onToggle: (userId: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  testIdPrefix?: string;
  maxSelected?: number;
}

export function AssigneePopoverInput({
  candidates,
  selectedUserIds,
  onToggle,
  disabled = false,
  invalid = false,
  placeholder = '担当者を選択',
  testIdPrefix = 'assignee-popover',
  maxSelected,
}: AssigneePopoverInputProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  // 開くたびに input box の bounding rect を取って popover 位置を計算 (fixed)
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPopoverStyle(null);
      return;
    }
    const r = triggerRef.current.getBoundingClientRect();
    setPopoverStyle({
      position: 'fixed',
      top: r.bottom + 4,
      left: r.left,
      minWidth: Math.max(r.width, 200),
      zIndex: 60,
    });
  }, [open]);

  // 外クリック / ESC で閉じる
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        wrapRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
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

  const labelById = new Map(candidates.map((c) => [c.userId, c.label]));
  const selectedSet = new Set(selectedUserIds);
  const selectedItems = selectedUserIds
    .map((id) => ({ userId: id, label: labelById.get(id) ?? id }));

  const boxClass = [
    'flex w-full min-h-[34px] cursor-pointer flex-wrap items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs transition-colors',
    invalid ? 'border-red-400' : 'border-gray-300',
    disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-gray-400',
  ].join(' ');

  return (
    <div ref={wrapRef} className="relative w-full">
      <div
        ref={triggerRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={boxClass}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        data-testid={`${testIdPrefix}-trigger`}
      >
        {selectedItems.length === 0 ? (
          <span className="text-gray-400">{placeholder}</span>
        ) : (
          selectedItems.map((it) => (
            <span
              key={it.userId}
              className="inline-flex items-center gap-1 rounded bg-vn-accent px-2 py-0.5 text-white"
              data-testid={`${testIdPrefix}-chip-${it.userId}`}
            >
              {it.label}
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(it.userId);
                  }}
                  className="text-white/80 hover:text-white"
                  aria-label={`${it.label} を外す`}
                  data-testid={`${testIdPrefix}-chip-remove-${it.userId}`}
                >
                  ×
                </button>
              )}
            </span>
          ))
        )}
        <span className="ml-auto text-gray-400">▼</span>
      </div>

      {open && popoverStyle && (
        <div
          ref={popoverRef}
          className="rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          style={popoverStyle}
          role="listbox"
          data-testid={`${testIdPrefix}-popover`}
        >
          {candidates.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">候補がありません</div>
          ) : (
            <>
              {candidates.map((c) => {
                const checked = selectedSet.has(c.userId);
                // 上限到達で未選択候補は無効化 (既選択の解除は常に許可)
                const reachedMax =
                  maxSelected !== undefined &&
                  selectedUserIds.length >= maxSelected &&
                  !checked;
                return (
                  <button
                    key={c.userId}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    aria-disabled={reachedMax}
                    disabled={reachedMax}
                    onClick={() => onToggle(c.userId)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                      reachedMax
                        ? 'cursor-not-allowed text-gray-400'
                        : 'text-gray-800 hover:bg-gray-50'
                    }`}
                    data-testid={`${testIdPrefix}-option-${c.userId}`}
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded border ${
                        checked
                          ? 'border-vn-accent bg-vn-accent text-white'
                          : reachedMax
                            ? 'border-gray-200 bg-gray-50'
                            : 'border-gray-300 bg-white'
                      }`}
                      aria-hidden
                    >
                      {checked && <span className="text-[10px] leading-none">✓</span>}
                    </span>
                    <span>{c.label}</span>
                  </button>
                );
              })}
              {maxSelected !== undefined && (
                <div className="border-t border-gray-100 px-3 py-1.5 text-[10px] text-gray-500">
                  {selectedUserIds.length} / {maxSelected} 名選択中
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
