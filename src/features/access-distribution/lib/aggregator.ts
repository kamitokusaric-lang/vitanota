// ヒートマップ (date × hour matrix) の初期化 + マージ utility。
// SQL で GROUP BY (date, hour) した結果は「データがない date×hour」を返さないため、
// JS 側で期間内の date 列を 0 埋めで初期化してから DB rows をマージする。
// timezone: UTC + 9h shift で JST、DST 無し (日本標準時)。

import type { HeatmapRow } from '@/features/access-distribution/types';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface HourDateValue {
  date: string; // YYYY-MM-DD (JST)
  hour: number; // 0-23 (JST)
  count: number;
}

// 期間内の JST 日付すべてを 0 埋めの hours[24] で初期化する
export function initializeHeatmap(
  startUtc: Date,
  endUtcExclusive: Date,
): HeatmapRow[] {
  const startJst = new Date(startUtc.getTime() + JST_OFFSET_MS);
  const endJst = new Date(endUtcExclusive.getTime() + JST_OFFSET_MS);
  const cursor = new Date(
    Date.UTC(
      startJst.getUTCFullYear(),
      startJst.getUTCMonth(),
      startJst.getUTCDate(),
    ),
  );
  const limit = new Date(
    Date.UTC(endJst.getUTCFullYear(), endJst.getUTCMonth(), endJst.getUTCDate()),
  );

  const rows: HeatmapRow[] = [];
  while (cursor < limit) {
    rows.push({
      date: cursor.toISOString().slice(0, 10),
      hours: Array(24).fill(0),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return rows;
}

// 初期化済みヒートマップに DB rows をマージする (in-place)
export function fillHeatmap(
  initial: HeatmapRow[],
  rows: HourDateValue[],
): HeatmapRow[] {
  const dateIndex = new Map(initial.map((r, i) => [r.date, i]));
  for (const row of rows) {
    const idx = dateIndex.get(row.date);
    if (idx === undefined) continue; // 期間外
    if (row.hour < 0 || row.hour > 23) continue;
    initial[idx]!.hours[row.hour] = row.count;
  }
  return initial;
}

// ヒートマップ全体の合計値
export function sumHeatmap(heatmap: HeatmapRow[]): number {
  let total = 0;
  for (const row of heatmap) {
    for (const v of row.hours) total += v;
  }
  return total;
}
