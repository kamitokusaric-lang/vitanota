// staffroom の props 駆動コンポーネント (BoardCard / StaffroomPeriodFilter) の単体テスト。
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BoardCard } from '@/features/staffroom/components/BoardCard';
import {
  StaffroomPeriodFilter,
  getDefaultBoardPeriod,
} from '@/features/staffroom/components/StaffroomPeriodFilter';
import type { BoardDto } from '@/features/staffroom/types';

function makeBoard(o: Partial<BoardDto> = {}): BoardDto {
  return {
    id: o.id ?? 'b1',
    authorUserId: o.authorUserId ?? 'u1',
    content: o.content ?? 'プリントのコツを共有します',
    isPublic: o.isPublic ?? true,
    ...o,
  } as BoardDto;
}

describe('BoardCard', () => {
  it('本文と投稿者名を表示する', () => {
    render(<BoardCard board={makeBoard({ authorUserId: 'u1' })} nameById={new Map([['u1', '田中先生']])} />);
    expect(screen.getByText(/プリントのコツを共有します/)).toBeInTheDocument();
    expect(screen.getByText(/田中先生/)).toBeInTheDocument();
  });

  it('投稿者名が引けないときは「ほかの先生」', () => {
    render(<BoardCard board={makeBoard({ authorUserId: 'unknown' })} nameById={new Map()} />);
    expect(screen.getByText(/ほかの先生/)).toBeInTheDocument();
  });

  it('非公開なら「自分だけ」を出す', () => {
    render(<BoardCard board={makeBoard({ isPublic: false })} nameById={new Map()} />);
    expect(screen.getByText('自分だけ')).toBeInTheDocument();
  });

  it('公開なら「自分だけ」を出さない', () => {
    render(<BoardCard board={makeBoard({ isPublic: true })} nameById={new Map()} />);
    expect(screen.queryByText('自分だけ')).not.toBeInTheDocument();
  });
});

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
