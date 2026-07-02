// 職員室ボードの期間ナビ (週毎のみ)。生徒ノートの日付ナビと同じ「前週 期間 翌週 ┃ 今週」の横 1 行体裁。
// 既定=今週。前週 / 翌週 で 1 週ずつめくる。値は常に {from,to} (YYYY-MM-DD・月曜〜日曜)。
// chimo 2026-07-02: 月毎表示を廃止 (週毎に会議メモを紐付ける方針へ)。
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getCurrentWeek } from '@/features/tasks/lib/periodCalc';

export interface BoardPeriod {
  from: string;
  to: string;
}

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

// YYYY-MM-DD → 「6月15日」。
function fmtJaDay(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

interface Props {
  value: BoardPeriod;
  onChange: (next: BoardPeriod) => void;
}

export function StaffroomPeriodFilter({ value, onChange }: Props) {
  const current = getDefaultBoardPeriod();
  const isCurrent = value.from === current.from;
  const prev = { from: addDays(value.from, -7), to: addDays(value.to, -7) };
  const next = { from: addDays(value.from, 7), to: addDays(value.to, 7) };
  const label = `${fmtJaDay(value.from)} 〜 ${fmtJaDay(value.to)}`;

  return (
    // 週ナビ (生徒ノートの日付ナビと同じ 前週 期間 翌週 ┃ 今週 の横 1 行体裁)
    <div className="flex flex-wrap items-center justify-center gap-2.5">
      <button
        type="button"
        onClick={() => onChange(prev)}
        className="inline-flex items-center gap-0.5 text-sm text-gray-400 transition-colors hover:text-gray-600"
        data-testid="board-period-prev"
      >
        <ChevronLeft size={16} aria-hidden />
        前週
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
        翌週
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
        今週
      </button>
    </div>
  );
}
