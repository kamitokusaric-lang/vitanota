// タスクボードの期間フィルタ (chip + popover 形式)
// trigger は現在のフィルタを表す chip。クリックで popover が開き、preset とカスタム範囲を選べる
// default mode = 「今日以降 + 期限なし + 期限切れ未完了」(初期表示)
// 「今週」「先週」「来週」「今月」「先月」は range mode の preset として並ぶ
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  getCurrentMonth,
  getCurrentWeek,
  getLastMonth,
  getLastWeek,
  getNextWeek,
} from '../lib/periodCalc';

export type PeriodValue =
  | { mode: 'default' }
  | { mode: 'range'; from: string; to: string };

type Preset =
  | 'current_week'
  | 'last_week'
  | 'next_week'
  | 'current_month'
  | 'last_month';

interface PeriodFilterProps {
  value: PeriodValue;
  onChange: (next: PeriodValue) => void;
}

function formatYmdShort(ymd: string): string {
  // 'YYYY-MM-DD' → 'M/D'
  const [, m, d] = ymd.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  const presets = useMemo(() => {
    const now = new Date();
    const cw = getCurrentWeek(now);
    return {
      current_week: { from: cw.weekStart, to: cw.weekEnd },
      last_week: getLastWeek(now),
      next_week: getNextWeek(now),
      current_month: getCurrentMonth(now),
      last_month: getLastMonth(now),
    };
  }, []);

  const matchedPreset: Preset | null = (() => {
    if (value.mode !== 'range') return null;
    const { from, to } = value;
    if (presets.current_week.from === from && presets.current_week.to === to) return 'current_week';
    if (presets.last_week.from === from && presets.last_week.to === to) return 'last_week';
    if (presets.next_week.from === from && presets.next_week.to === to) return 'next_week';
    if (presets.current_month.from === from && presets.current_month.to === to) return 'current_month';
    if (presets.last_month.from === from && presets.last_month.to === to) return 'last_month';
    return null;
  })();

  // chip ラベル
  const chipLabel = (() => {
    if (value.mode === 'default') return '今日以降';
    if (matchedPreset === 'current_week') return '今週';
    if (matchedPreset === 'last_week') return '先週';
    if (matchedPreset === 'next_week') return '来週';
    if (matchedPreset === 'current_month') return '今月';
    if (matchedPreset === 'last_month') return '先月';
    return `${formatYmdShort(value.from)}〜${formatYmdShort(value.to)}`;
  })();

  // popover 位置計算
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
      minWidth: Math.max(r.width, 240),
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

  const applyPreset = (preset: Preset) => {
    const range = presets[preset];
    onChange({ mode: 'range', from: range.from, to: range.to });
  };

  // カスタム入力の現在値 (range mode の生 from/to を使う / default 時は今日を初期値)
  const customFrom = value.mode === 'range' ? value.from : new Date().toISOString().slice(0, 10);
  const customTo = value.mode === 'range' ? value.to : new Date().toISOString().slice(0, 10);

  const presetItems: Array<{ key: 'default' | Preset; label: string; isActive: boolean }> = [
    { key: 'default', label: '今日以降 (初期表示)', isActive: value.mode === 'default' },
    { key: 'current_week', label: '今週', isActive: matchedPreset === 'current_week' },
    { key: 'last_week', label: '先週', isActive: matchedPreset === 'last_week' },
    { key: 'next_week', label: '来週', isActive: matchedPreset === 'next_week' },
    { key: 'current_month', label: '今月', isActive: matchedPreset === 'current_month' },
    { key: 'last_month', label: '先月', isActive: matchedPreset === 'last_month' },
  ];

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
        data-testid="period-filter-trigger"
      >
        <span className="text-gray-500">期間:</span>
        <span className="font-medium text-gray-800">{chipLabel}</span>
        <span className="text-gray-400">▼</span>
      </button>

      {open && popoverStyle && (
        <div
          ref={popoverRef}
          className="rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          style={popoverStyle}
          role="dialog"
          aria-label="期間を選択"
          data-testid="period-filter-popover"
        >
          {presetItems.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                if (p.key === 'default') onChange({ mode: 'default' });
                else applyPreset(p.key);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                p.isActive ? 'bg-gray-50 text-gray-900' : 'text-gray-800 hover:bg-gray-50'
              }`}
              data-testid={`period-filter-preset-${p.key}`}
            >
              <span className="w-3 text-vn-accent">{p.isActive ? '✓' : ''}</span>
              <span>{p.label}</span>
            </button>
          ))}
          <div className="my-1 border-t border-gray-100" />
          <div className="px-3 py-1.5 text-[11px] text-gray-500">カスタム範囲</div>
          <div className="flex items-center gap-1 px-3 pb-2 text-xs text-gray-700">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => {
                const next = e.target.value;
                if (!next) return;
                const to = value.mode === 'range' ? value.to : next;
                onChange({ mode: 'range', from: next, to });
              }}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
              data-testid="period-filter-custom-from"
            />
            <span>〜</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => {
                const next = e.target.value;
                if (!next) return;
                const from = value.mode === 'range' ? value.from : next;
                onChange({ mode: 'range', from, to: next });
              }}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
              data-testid="period-filter-custom-to"
            />
          </div>
        </div>
      )}
    </div>
  );
}
