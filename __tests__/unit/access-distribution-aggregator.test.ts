import { describe, it, expect } from 'vitest';
import {
  aggregateToJstHourly,
  mergeHourly,
  computeSummary,
} from '@/features/access-distribution/lib/aggregator';
import type { CloudWatchDataPoint } from '@/features/access-distribution/lib/cloudwatchClient';

describe('aggregateToJstHourly (UTC → JST hour bucket + date×hour matrix)', () => {
  it('空配列でも期間内の全日付を 0 で初期化した heatmap を返す', () => {
    const start = new Date('2026-05-08T00:00:00+09:00');
    const endExcl = new Date('2026-05-15T00:00:00+09:00');
    const result = aggregateToJstHourly([], start, endExcl);

    expect(result.hourly).toHaveLength(24);
    expect(result.hourly.every((h) => h.pv === 0)).toBe(true);
    expect(result.heatmap).toHaveLength(7);
    expect(result.heatmap[0]!.date).toBe('2026-05-08');
    expect(result.heatmap[6]!.date).toBe('2026-05-14');
    expect(result.heatmap[0]!.hours).toHaveLength(24);
    expect(result.heatmap[0]!.hours.every((v) => v === 0)).toBe(true);
  });

  it('UTC datapoint を JST hour に正しく変換 (+9h shift)', () => {
    const start = new Date('2026-05-15T00:00:00+09:00');
    const endExcl = new Date('2026-05-16T00:00:00+09:00');
    // UTC 23:00 = JST 08:00 (次の日)
    const datapoints: CloudWatchDataPoint[] = [
      { timestamp: new Date('2026-05-14T23:00:00Z'), value: 100 },
      // UTC 00:00 = JST 09:00 (同日)
      { timestamp: new Date('2026-05-15T00:00:00Z'), value: 200 },
    ];
    const result = aggregateToJstHourly(datapoints, start, endExcl);

    const h8 = result.hourly.find((h) => h.hour === 8);
    const h9 = result.hourly.find((h) => h.hour === 9);
    expect(h8?.pv).toBe(100);
    expect(h9?.pv).toBe(200);

    const day = result.heatmap.find((r) => r.date === '2026-05-15');
    expect(day).toBeDefined();
    expect(day!.hours[8]).toBe(100);
    expect(day!.hours[9]).toBe(200);
  });

  it('期間外の datapoint は hourly に加算するが heatmap には載らない (defensive)', () => {
    const start = new Date('2026-05-15T00:00:00+09:00');
    const endExcl = new Date('2026-05-16T00:00:00+09:00');
    const datapoints: CloudWatchDataPoint[] = [
      // 期間外 (UTC 1 ヶ月前)
      { timestamp: new Date('2026-04-15T03:00:00Z'), value: 50 },
    ];
    const result = aggregateToJstHourly(datapoints, start, endExcl);
    // heatmap の対象は 2026-05-15 のみ、期間外 datapoint は heatmap に含まれない
    expect(result.heatmap).toHaveLength(1);
    expect(result.heatmap[0]!.date).toBe('2026-05-15');
  });

  it('月跨ぎ (3 日間で月末を含む) で日付が正しく並ぶ', () => {
    const start = new Date('2026-04-30T00:00:00+09:00');
    const endExcl = new Date('2026-05-03T00:00:00+09:00');
    const result = aggregateToJstHourly([], start, endExcl);
    expect(result.heatmap.map((r) => r.date)).toEqual([
      '2026-04-30',
      '2026-05-01',
      '2026-05-02',
    ]);
  });

  it('同一時間帯への複数 datapoint は加算される', () => {
    const start = new Date('2026-05-15T00:00:00+09:00');
    const endExcl = new Date('2026-05-16T00:00:00+09:00');
    // どちらも UTC 23:30:00 = JST 08:30、bucket は hour=8
    // ただし CloudWatch period=3600 では 1 つ目しか出ないが、防御的に複数を加算するテスト
    const datapoints: CloudWatchDataPoint[] = [
      { timestamp: new Date('2026-05-14T23:00:00Z'), value: 100 },
      { timestamp: new Date('2026-05-14T23:30:00Z'), value: 50 },
    ];
    const result = aggregateToJstHourly(datapoints, start, endExcl);
    const h8 = result.hourly.find((h) => h.hour === 8);
    expect(h8?.pv).toBe(150);
  });
});

describe('mergeHourly (PV と UU の merge)', () => {
  it('PV hourly に UU hourly を hour で merge', () => {
    const pv = [
      { hour: 0, pv: 10 },
      { hour: 1, pv: 20 },
      { hour: 2, pv: 30 },
    ];
    const uu = [
      { hour: 0, uu: 3 },
      { hour: 2, uu: 5 },
    ];
    const merged = mergeHourly(pv, uu);
    expect(merged).toEqual([
      { hour: 0, pv: 10, uu: 3 },
      { hour: 1, pv: 20, uu: 0 }, // UU 不在の hour は 0
      { hour: 2, pv: 30, uu: 5 },
    ]);
  });
});

describe('computeSummary', () => {
  it('totalPv / peakHour / avgPvPerHour を計算', () => {
    const hourly = [
      { hour: 0, pv: 0, uu: 0 },
      { hour: 8, pv: 2183, uu: 100 },
      { hour: 10, pv: 626, uu: 80 },
    ];
    const summary = computeSummary(hourly, 50, 7);
    expect(summary.totalPv).toBe(2809);
    expect(summary.totalUu).toBe(50);
    expect(summary.peakHour).toBe(8);
    expect(summary.peakHourPv).toBe(2183);
    // 2809 / (24 * 7) = 16.72
    expect(summary.avgPvPerHour).toBeCloseTo(16.72, 1);
  });

  it('periodDays=0 の場合 avgPvPerHour=0', () => {
    const summary = computeSummary([], 0, 0);
    expect(summary.avgPvPerHour).toBe(0);
  });
});
