// staffroom の props 駆動コンポーネントの単体テスト。
// 2026-08-07: 情報共有セクション撤去に伴い BoardCard を削除したため、
// 残るのは週ナビ (StaffroomPeriodFilter) のみ。
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  StaffroomPeriodFilter,
  getDefaultBoardPeriod,
} from '@/features/staffroom/components/StaffroomPeriodFilter';

describe('StaffroomPeriodFilter', () => {
  it('getDefaultBoardPeriod は今週 (from <= to) を返す', () => {
    const p = getDefaultBoardPeriod(new Date('2026-06-15T00:00:00+09:00'));
    expect(p.from <= p.to).toBe(true);
    expect(p.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('表示中の週を「M月D日 〜 M月D日」で出す', () => {
    render(
      <StaffroomPeriodFilter value={{ from: '2026-06-15', to: '2026-06-21' }} onChange={vi.fn()} />,
    );
    const label = screen.getByTestId('board-period-label');
    expect(label.textContent).toContain('6月15日');
    expect(label.textContent).toContain('6月21日');
  });

  it('先週に戻る / 次の週に進む で 1 週ずつめくる', () => {
    const onChange = vi.fn();
    // 過去週 (今週でない) なら次の週ボタンも有効
    render(
      <StaffroomPeriodFilter value={{ from: '2026-06-08', to: '2026-06-14' }} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId('board-period-prev'));
    expect(onChange).toHaveBeenCalledWith({ from: '2026-06-01', to: '2026-06-07' });
    fireEvent.click(screen.getByTestId('board-period-next'));
    expect(onChange).toHaveBeenCalledWith({ from: '2026-06-15', to: '2026-06-21' });
  });

  it('今週のときは「今週」と「次の週に進む」が無効 (未来は見せない)', () => {
    const thisWeek = getDefaultBoardPeriod();
    render(<StaffroomPeriodFilter value={thisWeek} onChange={vi.fn()} />);
    expect(screen.getByTestId('board-period-next')).toBeDisabled();
    expect(screen.getByTestId('board-period-this')).toBeDisabled();
  });
});
