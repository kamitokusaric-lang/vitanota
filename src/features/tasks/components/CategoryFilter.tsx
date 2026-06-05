// タスクのカテゴリ絞込 (chip + popover、multi-select)
// 空配列 = 全カテゴリ (フィルタなし) / OR 条件で複数選択可
import { usePopover } from '../hooks/usePopover';
import type { TaskCategory } from '@/db/schema';

interface CategoryFilterProps {
  value: string[]; // 空配列 = 全カテゴリ
  onChange: (value: string[]) => void;
  categories: TaskCategory[];
}

export function CategoryFilter({ value, onChange, categories }: CategoryFilterProps) {
  const { open, setOpen, wrapRef, triggerRef, popoverRef, popoverStyle } =
    usePopover();

  const selectedSet = new Set(value);
  const selected = categories.filter((c) => selectedSet.has(c.id));
  const chipLabel = (() => {
    if (selected.length === 0) return '全て';
    if (selected.length === 1) return selected[0]!.name;
    return `${selected[0]!.name} +${selected.length - 1}`;
  })();

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
        data-testid="category-filter-trigger"
      >
        <span className="font-normal text-slate-500">カテゴリ:</span>
        <span className="font-semibold text-slate-700">{chipLabel}</span>
        <span className="text-slate-400">▼</span>
      </button>

      {open && popoverStyle && (
        <div
          ref={popoverRef}
          className="overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          style={popoverStyle}
          role="dialog"
          aria-label="カテゴリを選択"
          data-testid="category-filter-popover"
        >
          <button
            type="button"
            onClick={() => onChange([])}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
              value.length === 0 ? 'bg-gray-50 text-gray-900' : 'text-gray-800 hover:bg-gray-50'
            }`}
            data-testid="category-filter-option-all"
          >
            <span className="w-3 text-vn-accent">{value.length === 0 ? '✓' : ''}</span>
            <span>全て</span>
          </button>
          {categories.map((c) => {
            const checked = selectedSet.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                  checked ? 'bg-gray-50 text-gray-900' : 'text-gray-800 hover:bg-gray-50'
                }`}
                data-testid={`category-filter-option-${c.id}`}
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
                <span>{c.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
