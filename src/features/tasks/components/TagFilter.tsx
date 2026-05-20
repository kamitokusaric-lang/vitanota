// タスクのタグ絞込 (chip + popover、multi-select)
// 空配列 = 全タグ (フィルタなし) / OR 条件で複数選択可
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { TaskTag } from '../hooks/useTaskTags';

interface TagFilterProps {
  value: string[]; // 空配列 = 全タグ
  onChange: (value: string[]) => void;
  tags: TaskTag[];
}

export function TagFilter({ value, onChange, tags }: TagFilterProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  const selectedSet = new Set(value);
  const selected = tags.filter((t) => selectedSet.has(t.id));
  const chipLabel = (() => {
    if (selected.length === 0) return '全て';
    if (selected.length === 1) return `#${selected[0]!.name}`;
    return `#${selected[0]!.name} +${selected.length - 1}`;
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

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
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
        data-testid="tag-filter-trigger"
      >
        <span className="font-normal text-slate-500">タグ:</span>
        <span className="font-semibold text-slate-700">{chipLabel}</span>
        <span className="text-slate-400">▼</span>
      </button>

      {open && popoverStyle && (
        <div
          ref={popoverRef}
          className="overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          style={popoverStyle}
          role="dialog"
          aria-label="タグを選択"
          data-testid="tag-filter-popover"
        >
          <button
            type="button"
            onClick={() => onChange([])}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
              value.length === 0 ? 'bg-gray-50 text-gray-900' : 'text-gray-800 hover:bg-gray-50'
            }`}
            data-testid="tag-filter-option-all"
          >
            <span className="w-3 text-vn-accent">{value.length === 0 ? '✓' : ''}</span>
            <span>全て</span>
          </button>
          {tags.map((t) => {
            const checked = selectedSet.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                  checked ? 'bg-gray-50 text-gray-900' : 'text-gray-800 hover:bg-gray-50'
                }`}
                data-testid={`tag-filter-option-${t.id}`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded border ${
                    checked
                      ? 'border-vn-accent bg-vn-accent text-white'
                      : 'border-gray-300 bg-white'
                  }`}
                  aria-hidden
                >
                  {checked && <span className="text-[10px] leading-none">✓</span>}
                </span>
                <span>#{t.name}</span>
                <span className="ml-auto text-[10px] text-gray-400">
                  {t.assignmentCount}件
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
