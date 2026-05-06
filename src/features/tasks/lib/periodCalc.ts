// タスクボード期間フィルタの境界計算 (月曜始まり、ローカル時間ベース)
// すべて 'YYYY-MM-DD' (ローカル日付) 文字列で返す。サーバーは DATE 型として受け取る

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 月曜日を週の始まりとした weekStart / weekEnd を返す
// getDay(): 0=日, 1=月, ..., 6=土 → 月曜までの日数 = (day + 6) % 7
function weekRangeMondaySunday(base: Date): { weekStart: string; weekEnd: string } {
  const day = base.getDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(base);
  monday.setDate(base.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { weekStart: toYmd(monday), weekEnd: toYmd(sunday) };
}

export function getCurrentWeek(now: Date = new Date()): { weekStart: string; weekEnd: string } {
  return weekRangeMondaySunday(now);
}

export function getLastWeek(now: Date = new Date()): { from: string; to: string } {
  const lastWeekBase = new Date(now);
  lastWeekBase.setDate(now.getDate() - 7);
  const { weekStart, weekEnd } = weekRangeMondaySunday(lastWeekBase);
  return { from: weekStart, to: weekEnd };
}

export function getNextWeek(now: Date = new Date()): { from: string; to: string } {
  const nextWeekBase = new Date(now);
  nextWeekBase.setDate(now.getDate() + 7);
  const { weekStart, weekEnd } = weekRangeMondaySunday(nextWeekBase);
  return { from: weekStart, to: weekEnd };
}

export function getCurrentMonth(now: Date = new Date()): { from: string; to: string } {
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: toYmd(first), to: toYmd(last) };
}

export function getLastMonth(now: Date = new Date()): { from: string; to: string } {
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: toYmd(first), to: toYmd(last) };
}
