// CloudWatch UTC datapoint を JST 時間帯バケット + 日付×時間帯マトリクスに集約する純粋関数。
// timezone: UTC + 9h shift で JST、DST 無し (日本標準時)。
import type { CloudWatchDataPoint } from './cloudwatchClient';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface JstHourlyResult {
  hourly: Array<{ hour: number; pv: number }>;
  heatmap: Array<{ date: string; hours: number[] }>;
}

export interface UuHourlyRow {
  hour: number;
  uu: number;
}

// UTC datapoint → JST hour bucket + date×hour matrix
// 期間内の全日付を 0 で初期化してから datapoints を加算する。
export function aggregateToJstHourly(
  datapoints: CloudWatchDataPoint[],
  startUtc: Date,
  endUtcExclusive: Date,
): JstHourlyResult {
  // hour buckets (0-23) を 0 で初期化
  const hourBuckets = new Map<number, number>();
  for (let h = 0; h < 24; h++) hourBuckets.set(h, 0);

  // date×hour matrix を期間内の全日付で初期化
  const dateMatrix = new Map<string, number[]>();
  const startJst = new Date(startUtc.getTime() + JST_OFFSET_MS);
  const endJst = new Date(endUtcExclusive.getTime() + JST_OFFSET_MS);
  // start の JST 日付から end の JST 日付 (exclusive 直前) まで
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
  while (cursor < limit) {
    const dateStr = cursor.toISOString().slice(0, 10);
    dateMatrix.set(dateStr, Array(24).fill(0));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  for (const dp of datapoints) {
    const jst = new Date(dp.timestamp.getTime() + JST_OFFSET_MS);
    const hour = jst.getUTCHours();
    const date = jst.toISOString().slice(0, 10);

    hourBuckets.set(hour, (hourBuckets.get(hour) ?? 0) + dp.value);

    if (!dateMatrix.has(date)) {
      // start より前の datapoint (period 範囲外) は無視
      continue;
    }
    const arr = dateMatrix.get(date)!;
    arr[hour] = (arr[hour] ?? 0) + dp.value;
  }

  const hourly = Array.from(hourBuckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([hour, pv]) => ({ hour, pv: Math.round(pv) }));

  const heatmap = Array.from(dateMatrix.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, hours]) => ({ date, hours: hours.map((v) => Math.round(v)) }));

  return { hourly, heatmap };
}

// PV hourly と UU hourly を hour で merge
export function mergeHourly(
  pvHourly: Array<{ hour: number; pv: number }>,
  uuHourly: UuHourlyRow[],
): Array<{ hour: number; pv: number; uu: number }> {
  const uuMap = new Map(uuHourly.map((u) => [u.hour, u.uu]));
  return pvHourly.map((p) => ({
    hour: p.hour,
    pv: p.pv,
    uu: uuMap.get(p.hour) ?? 0,
  }));
}

export interface SummaryResult {
  totalPv: number;
  totalUu: number;
  peakHour: number;
  peakHourPv: number;
  avgPvPerHour: number;
}

export function computeSummary(
  hourly: Array<{ hour: number; pv: number; uu: number }>,
  totalUu: number,
  periodDays: number,
): SummaryResult {
  let totalPv = 0;
  let peakHour = 0;
  let peakHourPv = 0;
  for (const h of hourly) {
    totalPv += h.pv;
    if (h.pv > peakHourPv) {
      peakHour = h.hour;
      peakHourPv = h.pv;
    }
  }
  const avgPvPerHour = periodDays > 0 ? totalPv / (24 * periodDays) : 0;
  return { totalPv, totalUu, peakHour, peakHourPv, avgPvPerHour };
}
