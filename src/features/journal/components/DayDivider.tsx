// 日付グループの divider (Linear 風の "時間の流れ" を表現)
// 設計方針 (2026-05-04 chimo): 上 24px / 下 8px の余白、12px グレー
import { memo } from 'react';

interface DayDividerProps {
  // ISO 文字列または Date。同じ日の判定は呼び出し側で済ませて渡す
  date: string | Date;
}

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
});

function formatDayLabel(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  // "5月4日（月）" 形式を生成 ("5/4（月）" でなく日本語ラベル)
  // Intl のデフォルト出力 "5/4(月)" を一部置換して整える
  const parts = WEEKDAY_FORMATTER.formatToParts(d);
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  return `${month}月${day}日（${weekday}）`;
}

export function isSameLocalDay(
  a: string | Date,
  b: string | Date,
): boolean {
  const da = typeof a === 'string' ? new Date(a) : a;
  const db = typeof b === 'string' ? new Date(b) : b;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function isSameDay(a: Date, b: Date): boolean {
  return isSameLocalDay(a, b);
}

function dayLabelOf(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(d, today)) return '今日';
  if (isSameDay(d, yesterday)) return '昨日';
  return formatDayLabel(d);
}

export const DayDivider = memo(function DayDivider({ date }: DayDividerProps) {
  return (
    <div
      className="px-3 pt-6 pb-2 text-sm font-semibold text-gray-500"
      data-testid="day-divider"
    >
      {dayLabelOf(date)}
    </div>
  );
});
