import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmotionSummaryCard } from '../EmotionSummaryCard';
import type { EmotionTrendResponse } from '../../schemas/emotionTrend';

const mockData: EmotionTrendResponse = {
  period: 'week',
  data: [
    { date: '2026-04-15', positive: 3, negative: 1, neutral: 2, total: 6 },
    { date: '2026-04-16', positive: 1, negative: 2, neutral: 0, total: 3 },
  ],
  totalEntries: 5,
};

describe('EmotionSummaryCard', () => {
  it('renders totals when data is sufficient', () => {
    render(<EmotionSummaryCard data={mockData} isLoading={false} />);
    expect(screen.getByTestId('emotion-summary-card')).toBeInTheDocument();
    expect(screen.getByText(/ポジティブ 4/)).toBeInTheDocument();
    expect(screen.getByText(/ネガティブ 3/)).toBeInTheDocument();
    expect(screen.getByText(/ニュートラル 2/)).toBeInTheDocument();
  });

  it('renders link to dashboard', () => {
    render(<EmotionSummaryCard data={mockData} isLoading={false} />);
    expect(screen.getByTestId('emotion-summary-card-link')).toHaveAttribute(
      'href',
      '/dashboard/teacher'
    );
  });

  it('returns null when data is insufficient', () => {
    const lowData: EmotionTrendResponse = { ...mockData, totalEntries: 2 };
    const { container } = render(
      <EmotionSummaryCard data={lowData} isLoading={false} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows skeleton when loading', () => {
    render(<EmotionSummaryCard data={undefined} isLoading={true} />);
    expect(screen.getByTestId('emotion-summary-card-skeleton')).toBeInTheDocument();
  });

  it('returns null when no data and not loading', () => {
    const { container } = render(
      <EmotionSummaryCard data={undefined} isLoading={false} />
    );
    expect(container.innerHTML).toBe('');
  });
});
