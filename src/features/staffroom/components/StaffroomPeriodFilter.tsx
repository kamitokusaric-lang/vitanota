// 職員室ボードの期間ナビ。生徒ノートの日付ナビと同じ「前◯ 期間 翌◯ ┃ 今◯」の横 1 行体裁の「週/月」版。
// 右上で 週毎 / 月毎 を切替。既定=今週。前(週/月) / 翌(週/月) で 1 つずつめくる。
// 値は常に {from,to} (YYYY-MM-DD・週=月曜〜日曜 / 月=1日〜末日)。
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getCurrentWeek, getCurrentMonth } from '@/features/tasks/lib/periodCalc';

export interface BoardPeriod {
  from: string;
  to: string;
}

type Mode = 'week' | 'month';

// 既定 = 今週 (月曜〜日曜)。
export function getDefaultBoardPeriod(now: Date = new Date()): BoardPeriod {
  const cw = getCurrentWeek(now);
  return { from: cw.weekStart, to: cw.weekEnd };
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// YYYY-MM-DD に n 日加算 (構成要素から組むので TZ ずれなし)。
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return toYmd(dt);
}

// ymd の月から delta か月ずらした月の 1日〜末日。
function monthRangeFrom(ymd: string, delta: number): BoardPeriod {
  const [y, m] = ymd.split('-').map(Number);
  const first = new Date(y, m - 1 + delta, 1);
  const last = new Date(y, m - 1 + delta + 1, 0);
  return { from: toYmd(first), to: toYmd(last) };
}

// YYYY-MM-DD → 「6月15日」。
function fmtJaDay(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

// YYYY-MM-DD → 「2026年6月」。
function fmtJaMonth(ymd: string): string {
  const [y, m] = ymd.split('-');
  return `${Number(y)}年${Number(m)}月`;
}

interface Props {
  value: BoardPeriod;
  onChange: (next: BoardPeriod) => void;
}

export function StaffroomPeriodFilter({ value, onChange }: Props) {
  const [mode, setMode] = useState<Mode>('week');

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    onChange(next === 'week' ? getDefaultBoardPeriod() : getCurrentMonth());
  };

  const isWeek = mode === 'week';
  const current = isWeek ? getDefaultBoardPeriod() : getCurrentMonth();
  const isCurrent = value.from === current.from;
  const prev = isWeek
    ? { from: addDays(value.from, -7), to: addDays(value.to, -7) }
    : monthRangeFrom(value.from, -1);
  const next = isWeek
    ? { from: addDays(value.from, 7), to: addDays(value.to, 7) }
    : monthRangeFrom(value.from, 1);
  const label = isWeek ? `${fmtJaDay(value.from)} 〜 ${fmtJaDay(value.to)}` : fmtJaMonth(value.from);

  const modeBtn = (m: Mode, text: string) =>
    `rounded px-2.5 py-1 transition-colors ${
      mode === m ? 'bg-vn-accent/10 font-semibold text-vn-accent' : 'text-gray-500 hover:text-gray-700'
    }`;

  return (
    <div className="space-y-2">
      {/* 右上: 週毎 / 月毎 切替 */}
      <div className="flex justify-end">
        <div
          className="inline-flex rounded-md border border-gray-300 bg-white p-0.5 text-xs"
          role="group"
          aria-label="表示単位"
        >
          <button
            type="button"
            onClick={() => switchMode('week')}
            aria-pressed={isWeek}
            className={modeBtn('week', '週毎')}
            data-testid="board-period-mode-week"
          >
            週毎表示
          </button>
          <button
            type="button"
            onClick={() => switchMode('month')}
            aria-pressed={!isWeek}
            className={modeBtn('month', '月毎')}
            data-testid="board-period-mode-month"
          >
            月毎表示
          </button>
        </div>
      </div>

      {/* 中央: 期間ナビ (生徒ノートの日付ナビと同じ 前◯ 期間 翌◯ ┃ 今◯ の横 1 行体裁) */}
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={() => onChange(prev)}
          className="inline-flex items-center gap-0.5 text-sm text-gray-400 transition-colors hover:text-gray-600"
          data-testid="board-period-prev"
        >
          <ChevronLeft size={16} aria-hidden />
          {isWeek ? '前週' : '前月'}
        </button>
        <span className="text-sm font-bold text-slate-700" data-testid="board-period-label">
          {label}
        </span>
        <button
          type="button"
          onClick={() => onChange(next)}
          disabled={isCurrent}
          className={`inline-flex items-center gap-0.5 text-sm text-gray-400 transition-colors hover:text-gray-600 ${
            isCurrent ? 'invisible' : ''
          }`}
          data-testid="board-period-next"
        >
          {isWeek ? '翌週' : '翌月'}
          <ChevronRight size={16} aria-hidden />
        </button>
        <span className="px-1 text-vn-border-strong" aria-hidden>
          |
        </span>
        <button
          type="button"
          onClick={() => onChange(current)}
          disabled={isCurrent}
          className={`rounded-md border border-vn-border bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors ${
            isCurrent ? '' : 'hover:bg-gray-50'
          }`}
          data-testid="board-period-this"
        >
          {isWeek ? '今週' : '今月'}
        </button>
      </div>
    </div>
  );
}
