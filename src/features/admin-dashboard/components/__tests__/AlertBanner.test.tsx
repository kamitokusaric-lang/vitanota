import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertBanner } from '../AlertBanner';

describe('AlertBanner', () => {
  it('shows count and link when alerts exist', () => {
    render(<AlertBanner openCount={3} />);
    expect(screen.getByTestId('alert-banner')).toHaveTextContent('3 件');
    expect(screen.getByTestId('alert-banner-link')).toHaveAttribute('href', '/dashboard/admin/alerts');
  });

  it('returns null when no alerts', () => {
    const { container } = render(<AlertBanner openCount={0} />);
    expect(container.innerHTML).toBe('');
  });
});
