// 職員室ボードの期間ナビ。生徒ノートの日付ナビと同じ体裁の「週/月」版。
// 右上で 週毎 / 月毎 を切替。既定=今週。先(週/月)に戻る / 次の(週/月)に進む で 1 つずつめくる。
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

      {/* 中央: 期間ナビ (モードに応じて 週 / 月) */}
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-sm font-medium text-slate-700" data-testid="board-period-label">
          {label}
        </span>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onChange(prev)}
            className="flex flex-shrink-0 flex-col items-center gap-0.5 px-1 text-gray-400 transition-colors hover:text-vn-accent"
            data-testid="board-period-prev"
          >
            <ChevronLeft size={20} aria-hidden />
            <span className="text-xs">{isWeek ? '先週に戻る' : '先月に戻る'}</span>
          </button>
          <button
            type="button"
            onClick={() => onChange(current)}
            disabled={isCurrent}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              isCurrent
                ? 'bg-vn-accent/10 text-vn-accent'
                : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
            }`}
            data-testid="board-period-this"
          >
            {isWeek ? '今週' : '今月'}
          </button>
          <button
            type="button"
            onClick={() => onChange(next)}
            disabled={isCurrent}
            className={`flex flex-shrink-0 flex-col items-center gap-0.5 px-1 text-gray-400 transition-colors hover:text-vn-accent ${
              isCurrent ? 'invisible' : ''
            }`}
            data-testid="board-period-next"
          >
            <ChevronRight size={20} aria-hidden />
            <span className="text-xs">{isWeek ? '次の週に進む' : '次の月に進む'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
