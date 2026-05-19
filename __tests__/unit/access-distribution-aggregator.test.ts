import { describe, it, expect } from 'vitest';
import {
  initializeHeatmap,
  fillHeatmap,
  sumHeatmap,
  initializeHeatmapWithSub,
  fillHeatmapWithSub,
} from '@/features/access-distribution/lib/aggregator';

describe('initializeHeatmap (JST 期間内の全日付を 0 埋めで初期化)', () => {
  it('期間内の全日付を 0 埋め hours[24] で初期化する', () => {
    const start = new Date('2026-05-08T00:00:00+09:00');
    const endExcl = new Date('2026-05-15T00:00:00+09:00');
    const rows = initializeHeatmap(start, endExcl);

    expect(rows).toHaveLength(7);
    expect(rows[0]!.date).toBe('2026-05-08');
    expect(rows[6]!.date).toBe('2026-05-14');
    expect(rows[0]!.hours).toHaveLength(24);
    expect(rows[0]!.hours.every((v) => v === 0)).toBe(true);
  });

  it('月跨ぎ (3 日間で月末を含む) で日付が正しく並ぶ', () => {
    const start = new Date('2026-04-30T00:00:00+09:00');
    const endExcl = new Date('2026-05-03T00:00:00+09:00');
    const rows = initializeHeatmap(start, endExcl);
    expect(rows.map((r) => r.date)).toEqual([
      '2026-04-30',
      '2026-05-01',
      '2026-05-02',
    ]);
  });
});

describe('fillHeatmap (DB rows を初期化済みヒートマップにマージ)', () => {
  it('期間内の date×hour に count を埋める', () => {
    const start = new Date('2026-05-15T00:00:00+09:00');
    const endExcl = new Date('2026-05-16T00:00:00+09:00');
    const initial = initializeHeatmap(start, endExcl);
    const filled = fillHeatmap(initial, [
      { date: '2026-05-15', hour: 8, count: 100 },
      { date: '2026-05-15', hour: 9, count: 200 },
    ]);
    expect(filled[0]!.hours[8]).toBe(100);
    expect(filled[0]!.hours[9]).toBe(200);
    expect(filled[0]!.hours[10]).toBe(0);
  });

  it('期間外の date は無視する (defensive)', () => {
    const start = new Date('2026-05-15T00:00:00+09:00');
    const endExcl = new Date('2026-05-16T00:00:00+09:00');
    const initial = initializeHeatmap(start, endExcl);
    fillHeatmap(initial, [{ date: '2025-01-01', hour: 8, count: 100 }]);
    expect(initial[0]!.hours[8]).toBe(0);
  });

  it('hour が範囲外 (<0 or >23) は無視する (defensive)', () => {
    const initial = initializeHeatmap(
      new Date('2026-05-15T00:00:00+09:00'),
      new Date('2026-05-16T00:00:00+09:00'),
    );
    fillHeatmap(initial, [
      { date: '2026-05-15', hour: 24, count: 100 },
      { date: '2026-05-15', hour: -1, count: 50 },
    ]);
    expect(initial[0]!.hours.every((v) => v === 0)).toBe(true);
  });
});

describe('initializeHeatmapWithSub (sub hours も 0 埋め)', () => {
  it('期間内の全日付を hours[24] + subHours[24] で 0 埋め初期化する', () => {
    const start = new Date('2026-05-15T00:00:00+09:00');
    const endExcl = new Date('2026-05-17T00:00:00+09:00');
    const rows = initializeHeatmapWithSub(start, endExcl);

    expect(rows).toHaveLength(2);
    expect(rows[0]!.date).toBe('2026-05-15');
    expect(rows[0]!.hours).toHaveLength(24);
    expect(rows[0]!.subHours).toHaveLength(24);
    expect(rows[0]!.hours.every((v) => v === 0)).toBe(true);
    expect(rows[0]!.subHours!.every((v) => v === 0)).toBe(true);
  });
});

describe('fillHeatmapWithSub (count + subCount をマージ)', () => {
  it('期間内の date×hour に count と subCount を埋める', () => {
    const start = new Date('2026-05-15T00:00:00+09:00');
    const endExcl = new Date('2026-05-16T00:00:00+09:00');
    const initial = initializeHeatmapWithSub(start, endExcl);
    const filled = fillHeatmapWithSub(initial, [
      { date: '2026-05-15', hour: 8, count: 10, subCount: 3 },
      { date: '2026-05-15', hour: 9, count: 5, subCount: 0 },
    ]);
    expect(filled[0]!.hours[8]).toBe(10);
    expect(filled[0]!.subHours![8]).toBe(3);
    expect(filled[0]!.hours[9]).toBe(5);
    expect(filled[0]!.subHours![9]).toBe(0);
    expect(filled[0]!.hours[10]).toBe(0);
    expect(filled[0]!.subHours![10]).toBe(0);
  });

  it('期間外の date は無視する (defensive)', () => {
    const start = new Date('2026-05-15T00:00:00+09:00');
    const endExcl = new Date('2026-05-16T00:00:00+09:00');
    const initial = initializeHeatmapWithSub(start, endExcl);
    fillHeatmapWithSub(initial, [
      { date: '2025-01-01', hour: 8, count: 100, subCount: 50 },
    ]);
    expect(initial[0]!.hours[8]).toBe(0);
    expect(initial[0]!.subHours![8]).toBe(0);
  });

  it('hour が範囲外 (<0 or >23) は無視する (defensive)', () => {
    const initial = initializeHeatmapWithSub(
      new Date('2026-05-15T00:00:00+09:00'),
      new Date('2026-05-16T00:00:00+09:00'),
    );
    fillHeatmapWithSub(initial, [
      { date: '2026-05-15', hour: 24, count: 10, subCount: 5 },
      { date: '2026-05-15', hour: -1, count: 7, subCount: 3 },
    ]);
    expect(initial[0]!.hours.every((v) => v === 0)).toBe(true);
    expect(initial[0]!.subHours!.every((v) => v === 0)).toBe(true);
  });
});

describe('sumHeatmap (全 cell の合計)', () => {
  it('全 cell の合計を返す', () => {
    const heatmap = [
      {
        date: '2026-05-15',
        hours: Array(24)
          .fill(0)
          .map((_, i) => (i === 8 ? 10 : 0)),
      },
      {
        date: '2026-05-16',
        hours: Array(24)
          .fill(0)
          .map((_, i) => (i === 9 ? 20 : 0)),
      },
    ];
    expect(sumHeatmap(heatmap)).toBe(30);
  });

  it('空ヒートマップは 0 を返す', () => {
    expect(sumHeatmap([])).toBe(0);
  });
});
