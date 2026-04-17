import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmotionRatioBar } from '../EmotionRatioBar';

describe('EmotionRatioBar', () => {
  it('renders segments for each category', () => {
    render(<EmotionRatioBar positive={3} negative={2} neutral={1} />);
    expect(screen.getByTestId('emotion-ratio-bar')).toBeInTheDocument();
    expect(screen.getByTestId('emotion-ratio-positive')).toBeInTheDocument();
    expect(screen.getByTestId('emotion-ratio-negative')).toBeInTheDocument();
    expect(screen.getByTestId('emotion-ratio-neutral')).toBeInTheDocument();
  });

  it('renders empty bar when total is 0', () => {
    render(<EmotionRatioBar positive={0} negative={0} neutral={0} />);
    expect(screen.getByTestId('emotion-ratio-bar-empty')).toBeInTheDocument();
  });

  it('hides zero segments', () => {
    render(<EmotionRatioBar positive={5} negative={0} neutral={0} />);
    expect(screen.getByTestId('emotion-ratio-positive')).toBeInTheDocument();
    expect(screen.queryByTestId('emotion-ratio-negative')).toBeNull();
  });
});
