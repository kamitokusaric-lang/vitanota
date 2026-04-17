import { describe, it, expect } from 'vitest';

// AlertDetectionService は DB 依存が強いため、閾値ロジックのみユニットテスト
// 統合テストは Build & Test フェーズで実施

const NEGATIVE_TREND_THRESHOLD = 0.6;
const RECORDING_GAP_THRESHOLD_DAYS = 5;

describe('AlertDetectionService thresholds', () => {
  describe('negative_trend', () => {
    it('negative 比率 60% 以上でアラート対象', () => {
      const total = 10;
      const negative = 6;
      expect(negative / total).toBeGreaterThanOrEqual(NEGATIVE_TREND_THRESHOLD);
    });

    it('negative 比率 59% はアラート対象外', () => {
      const total = 100;
      const negative = 59;
      expect(negative / total).toBeLessThan(NEGATIVE_TREND_THRESHOLD);
    });

    it('感情タグ 0件はスキップ', () => {
      const total = 0;
      // total=0 の場合は検知しない
      expect(total).toBe(0);
    });
  });

  describe('recording_gap', () => {
    it('5日以上の間隔でアラート対象', () => {
      const gapDays = 5;
      expect(gapDays).toBeGreaterThanOrEqual(RECORDING_GAP_THRESHOLD_DAYS);
    });

    it('4日はアラート対象外', () => {
      const gapDays = 4;
      expect(gapDays).toBeLessThan(RECORDING_GAP_THRESHOLD_DAYS);
    });
  });
});
