import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyStateGuide } from '../EmptyStateGuide';

describe('EmptyStateGuide', () => {
  it('shows remaining count', () => {
    render(<EmptyStateGuide currentCount={1} minRequired={3} />);
    expect(screen.getByTestId('empty-state-guide')).toHaveTextContent('あと 2 件');
  });

  it('shows 0 remaining when at threshold', () => {
    render(<EmptyStateGuide currentCount={3} minRequired={3} />);
    expect(screen.getByTestId('empty-state-guide')).toHaveTextContent('あと 0 件');
  });

  it('shows guide message', () => {
    render(<EmptyStateGuide currentCount={0} minRequired={3} />);
    expect(screen.getByTestId('empty-state-guide')).toHaveTextContent(
      '記録を続けるとグラフが表示されます'
    );
  });
});
