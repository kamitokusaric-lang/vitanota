import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmotionTrendChart } from '../EmotionTrendChart';
import type { EmotionTrendDataPoint } from '../../schemas/emotionTrend';

// Recharts uses ResizeObserver internally
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

const mockData: EmotionTrendDataPoint[] = [
  { date: '2026-04-15', positive: 3, negative: 1, neutral: 2, total: 6 },
  { date: '2026-04-16', positive: 1, negative: 0, neutral: 1, total: 2 },
];

describe('EmotionTrendChart', () => {
  it('renders chart container', () => {
    render(<EmotionTrendChart data={mockData} periodDays={7} />);
    expect(screen.getByTestId('emotion-trend-chart')).toBeInTheDocument();
  });

  it('renders with empty data', () => {
    render(<EmotionTrendChart data={[]} periodDays={7} />);
    expect(screen.getByTestId('emotion-trend-chart')).toBeInTheDocument();
  });
});
