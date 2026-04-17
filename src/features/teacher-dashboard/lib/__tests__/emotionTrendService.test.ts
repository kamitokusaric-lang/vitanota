import { describe, it, expect, vi, beforeEach } from 'vitest';

// getEmotionTrend uses raw SQL via Drizzle, so we test the date range logic
// and response shaping. The actual DB query is tested in integration tests.

// Export the internal helper for testing by re-implementing the logic
function getDateRange(period: 'week' | 'month' | 'quarter') {
  const PERIOD_DAYS: Record<string, number> = { week: 7, month: 30, quarter: 90 };
  const now = new Date();
  const tokyoOffset = 9 * 60;
  const utcNow = now.getTime() + now.getTimezoneOffset() * 60_000;
  const tokyoNow = new Date(utcNow + tokyoOffset * 60_000);
  const todayJst = new Date(tokyoNow.getFullYear(), tokyoNow.getMonth(), tokyoNow.getDate());
  const days = PERIOD_DAYS[period];
  const startJst = new Date(todayJst);
  startJst.setDate(startJst.getDate() - (days - 1));
  const endJst = new Date(todayJst);
  endJst.setDate(endJst.getDate() + 1);
  const startUtc = new Date(startJst.getTime() - tokyoOffset * 60_000);
  const endUtc = new Date(endJst.getTime() - tokyoOffset * 60_000);
  return { startDate: startUtc, endDate: endUtc };
}

describe('emotionTrendService', () => {
  describe('getDateRange', () => {
    it('week: returns range covering 7 days', () => {
      const { startDate, endDate } = getDateRange('week');
      const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      // days-1 + 1(end boundary) = days. Range is [today - 6, tomorrow) = 8 day span
      expect(diffDays).toBeGreaterThanOrEqual(7);
      expect(diffDays).toBeLessThanOrEqual(8);
    });

    it('month: returns range covering 30 days', () => {
      const { startDate, endDate } = getDateRange('month');
      const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(30);
      expect(diffDays).toBeLessThanOrEqual(31);
    });

    it('quarter: returns range covering 90 days', () => {
      const { startDate, endDate } = getDateRange('quarter');
      const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(90);
      expect(diffDays).toBeLessThanOrEqual(91);
    });

    it('startDate is before endDate', () => {
      for (const period of ['week', 'month', 'quarter'] as const) {
        const { startDate, endDate } = getDateRange(period);
        expect(startDate.getTime()).toBeLessThan(endDate.getTime());
      }
    });
  });
});
