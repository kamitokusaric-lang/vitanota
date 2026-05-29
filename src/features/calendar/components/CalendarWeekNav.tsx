// 週ナビ: 「← 前週 / 今週 / 翌週 →」 + 週範囲表示。
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarWeekNavProps {
  weekStart: string;
  weekEnd: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

function formatLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${m}/${d} (${WEEK_LABELS[date.getDay()]})`;
}

export function CalendarWeekNav({
  weekStart,
  weekEnd,
  onPrev,
  onNext,
  onToday,
}: CalendarWeekNavProps) {
  return (
    <div
      className="mb-4 flex items-center justify-between gap-2"
      data-testid="calendar-week-nav"
    >
      <button
        type="button"
        onClick={onPrev}
        data-testid="calendar-week-prev"
        className="inline-flex h-9 items-center gap-1 rounded-full border border-vn-border-strong bg-white px-3 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50"
      >
        <ChevronLeft size={14} aria-hidden />
        前週
      </button>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToday}
          data-testid="calendar-week-today"
          className="inline-flex h-9 items-center rounded-full bg-vn-accent px-4 text-[12px] font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          今週
        </button>
        <span
          className="text-[13px] text-slate-700"
          data-testid="calendar-week-range"
        >
          {formatLabel(weekStart)} 〜 {formatLabel(weekEnd)}
        </span>
      </div>
      <button
        type="button"
        onClick={onNext}
        data-testid="calendar-week-next"
        className="inline-flex h-9 items-center gap-1 rounded-full border border-vn-border-strong bg-white px-3 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50"
      >
        翌週
        <ChevronRight size={14} aria-hidden />
      </button>
    </div>
  );
}
