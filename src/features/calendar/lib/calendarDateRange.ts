// カレンダー週 view のための日付計算 (月曜始まり、 ローカル時間ベース)
// 既存 src/features/tasks/lib/periodCalc.ts と同じ JST 前提 (ブラウザローカル時刻)。
// すべて 'YYYY-MM-DD' 文字列で扱う。

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function mondayOf(base: Date): Date {
  const day = base.getDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(base);
  monday.setDate(base.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export interface WeekRange {
  weekStart: string; // YYYY-MM-DD (月曜)
  weekEnd: string;   // YYYY-MM-DD (日曜)
  days: string[];    // 月曜から日曜まで 7 日分
}

function buildRange(monday: Date): WeekRange {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(toYmd(d));
  }
  return {
    weekStart: days[0],
    weekEnd: days[6],
    days,
  };
}

export function getWeekRange(base: Date = new Date()): WeekRange {
  return buildRange(mondayOf(base));
}

export function shiftWeek(weekStart: string, deltaWeeks: number): WeekRange {
  const monday = parseYmd(weekStart);
  monday.setDate(monday.getDate() + deltaWeeks * 7);
  return buildRange(monday);
}

export function todayYmd(now: Date = new Date()): string {
  return toYmd(now);
}

// ────────────────────────────────────────────────────────
// 月 view 用 (Phase 2)
// ────────────────────────────────────────────────────────

export interface MonthGrid {
  monthStart: string; // YYYY-MM-DD (当月 1 日)
  monthEnd: string;   // YYYY-MM-DD (当月末日)
  gridFrom: string;   // YYYY-MM-DD (月初の週の月曜、 前月末を含む)
  gridTo: string;     // YYYY-MM-DD (月末の週の日曜、 翌月頭を含む)
  weeks: string[][];  // 5 or 6 週 × 7 日
  monthLabel: string; // "2026 年 5 月"
}

function buildMonthGrid(monthBase: Date): MonthGrid {
  const year = monthBase.getFullYear();
  const month = monthBase.getMonth(); // 0-11
  const monthStartDate = new Date(year, month, 1);
  const monthEndDate = new Date(year, month + 1, 0);
  const gridFromDate = mondayOf(monthStartDate);
  const gridToDate = new Date(mondayOf(monthEndDate));
  gridToDate.setDate(gridToDate.getDate() + 6);

  const weeks: string[][] = [];
  const cursor = new Date(gridFromDate);
  while (cursor.getTime() <= gridToDate.getTime()) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(toYmd(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  return {
    monthStart: toYmd(monthStartDate),
    monthEnd: toYmd(monthEndDate),
    gridFrom: toYmd(gridFromDate),
    gridTo: toYmd(gridToDate),
    weeks,
    monthLabel: `${year} 年 ${month + 1} 月`,
  };
}

export function getMonthGrid(base: Date = new Date()): MonthGrid {
  return buildMonthGrid(new Date(base.getFullYear(), base.getMonth(), 1));
}

export function shiftMonth(monthStart: string, deltaMonths: number): MonthGrid {
  const monthBase = parseYmd(monthStart);
  monthBase.setMonth(monthBase.getMonth() + deltaMonths);
  return buildMonthGrid(new Date(monthBase.getFullYear(), monthBase.getMonth(), 1));
}

export function isOutOfMonth(date: string, monthStart: string): boolean {
  return date.slice(0, 7) !== monthStart.slice(0, 7);
}
