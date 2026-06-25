// 月ナビ: 「← 前月 / 今月 / 翌月 →」 + 月ラベル。
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarMonthNavProps {
  monthLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function CalendarMonthNav({
  monthLabel,
  onPrev,
  onNext,
  onToday,
}: CalendarMonthNavProps) {
  return (
    <div
      className="mb-4 flex items-center justify-between gap-2"
      data-testid="calendar-month-nav"
    >
      <button
        type="button"
        onClick={onPrev}
        data-testid="calendar-month-prev"
        className="inline-flex h-9 items-center gap-1 rounded-full border border-vn-border-strong bg-white px-3 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50"
      >
        <ChevronLeft size={14} aria-hidden />
        前月
      </button>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToday}
          data-testid="calendar-month-today"
          className="inline-flex h-9 items-center rounded-full bg-vn-accent px-4 text-[12px] font-semibold text-white shadow-sm transition hover:bg-vn-accent-hover"
        >
          今月
        </button>
        <span
          className="text-[14px] font-semibold text-slate-700"
          data-testid="calendar-month-label"
        >
          {monthLabel}
        </span>
      </div>
      <button
        type="button"
        onClick={onNext}
        data-testid="calendar-month-next"
        className="inline-flex h-9 items-center gap-1 rounded-full border border-vn-border-strong bg-white px-3 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50"
      >
        翌月
        <ChevronRight size={14} aria-hidden />
      </button>
    </div>
  );
}
