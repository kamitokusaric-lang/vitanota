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
