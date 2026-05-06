import { describe, it, expect } from 'vitest';
import {
  getCurrentMonth,
  getCurrentWeek,
  getLastMonth,
  getLastWeek,
  getNextWeek,
} from '@/features/tasks/lib/periodCalc';

// 月曜始まり / ローカル日付 (YYYY-MM-DD) ベース
// 各テストで `new Date(year, month, date)` を使ってローカル時間で構築する (UTC ズレ予防)

describe('getCurrentWeek (月曜〜日曜)', () => {
  it('水曜が起点: その週の月曜〜日曜を返す', () => {
    // 2026-05-06 (水)
    const res = getCurrentWeek(new Date(2026, 4, 6));
    expect(res).toEqual({ weekStart: '2026-05-04', weekEnd: '2026-05-10' });
  });

  it('月曜が起点: 月曜〜日曜', () => {
    // 2026-05-04 (月)
    const res = getCurrentWeek(new Date(2026, 4, 4));
    expect(res).toEqual({ weekStart: '2026-05-04', weekEnd: '2026-05-10' });
  });

  it('日曜が起点: その週 (= 過ぎた月曜から日曜) を返す', () => {
    // 2026-05-10 (日)
    const res = getCurrentWeek(new Date(2026, 4, 10));
    expect(res).toEqual({ weekStart: '2026-05-04', weekEnd: '2026-05-10' });
  });

  it('月またぎ: 月曜が前月最終週にあたる', () => {
    // 2026-06-03 (水) → 月曜は 2026-06-01 (月)
    const res = getCurrentWeek(new Date(2026, 5, 3));
    expect(res).toEqual({ weekStart: '2026-06-01', weekEnd: '2026-06-07' });
  });

  it('年またぎ: 12/31 (木) → 月曜は 12/29 / 日曜は翌年 1/4', () => {
    // 2026-12-31 (木)
    const res = getCurrentWeek(new Date(2026, 11, 31));
    expect(res).toEqual({ weekStart: '2026-12-28', weekEnd: '2027-01-03' });
  });
});

describe('getLastWeek', () => {
  it('水曜起点: 先週の月曜〜日曜', () => {
    // 2026-05-06 (水) → 先週 = 2026-04-27 〜 2026-05-03
    const res = getLastWeek(new Date(2026, 4, 6));
    expect(res).toEqual({ from: '2026-04-27', to: '2026-05-03' });
  });

  it('月曜起点: その月曜の前の週', () => {
    // 2026-05-04 (月) → 先週 = 2026-04-27 〜 2026-05-03
    const res = getLastWeek(new Date(2026, 4, 4));
    expect(res).toEqual({ from: '2026-04-27', to: '2026-05-03' });
  });
});

describe('getNextWeek', () => {
  it('水曜起点: 来週の月曜〜日曜', () => {
    // 2026-05-06 (水) → 来週 = 2026-05-11 〜 2026-05-17
    const res = getNextWeek(new Date(2026, 4, 6));
    expect(res).toEqual({ from: '2026-05-11', to: '2026-05-17' });
  });

  it('日曜起点: 翌日 (月曜) からの 1 週間', () => {
    // 2026-05-10 (日) → 来週 = 2026-05-11 〜 2026-05-17
    const res = getNextWeek(new Date(2026, 4, 10));
    expect(res).toEqual({ from: '2026-05-11', to: '2026-05-17' });
  });
});

describe('getCurrentMonth', () => {
  it('月の途中: 1 日〜末日を返す', () => {
    const res = getCurrentMonth(new Date(2026, 4, 15));
    expect(res).toEqual({ from: '2026-05-01', to: '2026-05-31' });
  });

  it('月初 (1 日)', () => {
    const res = getCurrentMonth(new Date(2026, 4, 1));
    expect(res).toEqual({ from: '2026-05-01', to: '2026-05-31' });
  });

  it('月末: 30 日締めの月 (4 月)', () => {
    const res = getCurrentMonth(new Date(2026, 3, 30));
    expect(res).toEqual({ from: '2026-04-01', to: '2026-04-30' });
  });

  it('うるう年 2 月 (2024-02-15) → 1 日〜29 日', () => {
    const res = getCurrentMonth(new Date(2024, 1, 15));
    expect(res).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });

  it('平年 2 月 (2026-02-15) → 1 日〜28 日', () => {
    const res = getCurrentMonth(new Date(2026, 1, 15));
    expect(res).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});

describe('getLastMonth', () => {
  it('5 月起点: 4 月 1 日〜30 日', () => {
    const res = getLastMonth(new Date(2026, 4, 6));
    expect(res).toEqual({ from: '2026-04-01', to: '2026-04-30' });
  });

  it('1 月起点: 前年 12 月 1 日〜31 日', () => {
    const res = getLastMonth(new Date(2026, 0, 15));
    expect(res).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('3 月起点 (うるう年): 2024 年 2 月 1 日〜29 日', () => {
    const res = getLastMonth(new Date(2024, 2, 10));
    expect(res).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });
});
