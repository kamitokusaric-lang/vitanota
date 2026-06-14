// 職員室ボードの投稿日 期間フィルタ (chip + popover)。タスクボードの PeriodFilter と同じ体裁。
// presets: 今週 (既定) / 先週 / 今月 / 先月 + カスタム範囲。値は常に {from,to} (YYYY-MM-DD)。
import { useMemo } from 'react';
import { usePopover } from '@/features/tasks/hooks/usePopover';
import {
  getCurrentWeek,
  getLastWeek,
  getCurrentMonth,
  getLastMonth,
} from '@/features/tasks/lib/periodCalc';

export interface BoardPeriod {
  from: string;
  to: string;
}

type Preset = 'current_week' | 'last_week' | 'current_month' | 'last_month';

// 既定 = 今週。
export function getDefaultBoardPeriod(now: Date = new Date()): BoardPeriod {
  const cw = getCurrentWeek(now);
  return { from: cw.weekStart, to: cw.weekEnd };
}

function fmt(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${Number(m)}/${Number(d)}`;
}

interface Props {
  value: BoardPeriod;
  onChange: (next: BoardPeriod) => void;
}

export function StaffroomPeriodFilter({ value, onChange }: Props) {
  const { open, setOpen, wrapRef, triggerRef, popoverRef, popoverStyle } =
    usePopover({ minWidth: 240, maxHeight: false });

  const presets = useMemo(() => {
    const now = new Date();
    const cw = getCurrentWeek(now);
    return {
      current_week: { from: cw.weekStart, to: cw.weekEnd },
      last_week: getLastWeek(now),
      current_month: getCurrentMonth(now),
      last_month: getLastMonth(now),
    } as Record<Preset, BoardPeriod>;
  }, []);

  const matched: Preset | null = (() => {
    for (const k of ['current_week', 'last_week', 'current_month', 'last_month'] as Preset[]) {
      if (presets[k].from === value.from && presets[k].to === value.to) return k;
    }
    return null;
  })();

  const chipLabel =
    matched === 'current_week'
      ? '今週'
      : matched === 'last_week'
        ? '先週'
        : matched === 'current_month'
          ? '今月'
          : matched === 'last_month'
            ? '先月'
            : `${fmt(value.from)}〜${fmt(value.to)}`;

  const items: { key: Preset; label: string }[] = [
    { key: 'current_week', label: '今週' },
    { key: 'last_week', label: '先週' },
    { key: 'current_month', label: '今月' },
    { key: 'last_month', label: '先月' },
  ];

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-vn-border-strong bg-white px-[11px] text-[12px] font-medium text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50"
        data-testid="board-period-filter-trigger"
      >
        <span className="font-normal text-slate-500">投稿日:</span>
        <span className="font-semibold text-slate-700">{chipLabel}</span>
        <span className="text-slate-400">▼</span>
      </button>

      {open && popoverStyle && (
        <div
          ref={popoverRef}
          className="rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          style={popoverStyle}
          role="dialog"
          aria-label="期間を選択"
          data-testid="board-period-filter-popover"
        >
          {items.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                onChange(presets[p.key]);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                matched === p.key ? 'bg-gray-50 text-gray-900' : 'text-gray-800 hover:bg-gray-50'
              }`}
              data-testid={`board-period-filter-preset-${p.key}`}
            >
              <span className="w-3 text-vn-accent">{matched === p.key ? '✓' : ''}</span>
              <span>{p.label}</span>
            </button>
          ))}
          <div className="my-1 border-t border-gray-100" />
          <div className="px-3 py-1.5 text-[11px] text-gray-500">カスタム範囲</div>
          <div className="flex items-center gap-1 px-3 pb-2 text-xs text-gray-700">
            <input
              type="date"
              value={value.from}
              onChange={(e) => {
                if (e.target.value) onChange({ from: e.target.value, to: value.to });
              }}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
              data-testid="board-period-filter-custom-from"
            />
            <span>〜</span>
            <input
              type="date"
              value={value.to}
              onChange={(e) => {
                if (e.target.value) onChange({ from: value.from, to: e.target.value });
              }}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
              data-testid="board-period-filter-custom-to"
            />
          </div>
        </div>
      )}
    </div>
  );
}
