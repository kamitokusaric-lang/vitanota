import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PeriodSelector } from '../PeriodSelector';

describe('PeriodSelector', () => {
  it('renders all three period buttons', () => {
    render(<PeriodSelector value="week" onChange={vi.fn()} />);
    expect(screen.getByTestId('period-selector-week')).toHaveTextContent('週');
    expect(screen.getByTestId('period-selector-month')).toHaveTextContent('月');
    expect(screen.getByTestId('period-selector-quarter')).toHaveTextContent('3ヶ月');
  });

  it('highlights the selected period', () => {
    render(<PeriodSelector value="month" onChange={vi.fn()} />);
    expect(screen.getByTestId('period-selector-month').className).toContain('bg-blue-600');
    expect(screen.getByTestId('period-selector-week').className).not.toContain('bg-blue-600');
  });

  it('calls onChange when a period is clicked', () => {
    const onChange = vi.fn();
    render(<PeriodSelector value="week" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('period-selector-quarter'));
    expect(onChange).toHaveBeenCalledWith('quarter');
  });
});
