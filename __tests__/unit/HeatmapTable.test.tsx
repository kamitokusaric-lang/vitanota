import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeatmapTable } from '@/features/access-distribution/components/HeatmapTable';
import type { HeatmapRow } from '@/features/access-distribution/types';

function makeRow(date: string, fill: number, sub?: number): HeatmapRow {
  return {
    date,
    hours: Array(24).fill(fill),
    ...(sub !== undefined ? { subHours: Array(24).fill(sub) } : {}),
  };
}

describe('HeatmapTable', () => {
  it('title と caption を表示する', () => {
    render(
      <HeatmapTable
        heatmap={[makeRow('2026-05-15', 0)]}
        title="UU"
        caption="ログイン教員数"
      />,
    );
    expect(screen.getByText('UU')).toBeInTheDocument();
    expect(screen.getByText('ログイン教員数')).toBeInTheDocument();
  });

  it('date 行を表示する', () => {
    render(<HeatmapTable heatmap={[makeRow('2026-05-15', 0)]} />);
    expect(screen.getByText('2026-05-15')).toBeInTheDocument();
  });

  it('subHours が無いとき cell に main 値のみ表示', () => {
    render(<HeatmapTable heatmap={[makeRow('2026-05-15', 5)]} />);
    const cells = screen.getAllByText('5');
    expect(cells.length).toBeGreaterThan(0);
  });

  it('subHours があるとき cell に "N (M)" 形式で表示', () => {
    render(<HeatmapTable heatmap={[makeRow('2026-05-15', 10, 3)]} />);
    const cells = screen.getAllByText('10 (3)');
    expect(cells.length).toBeGreaterThan(0);
  });

  it('subHours があっても sub が 0 のときは "N" のみで括弧なし', () => {
    render(<HeatmapTable heatmap={[makeRow('2026-05-15', 7, 0)]} />);
    const cells = screen.getAllByText('7');
    expect(cells.length).toBeGreaterThan(0);
    expect(screen.queryByText('7 (0)')).not.toBeInTheDocument();
  });

  it('値が 0 の cell は空 (テキスト無)', () => {
    const { container } = render(
      <HeatmapTable heatmap={[makeRow('2026-05-15', 0)]} />,
    );
    // 24 個の td はあるが、 全部 0 なので "0" テキストは無い
    expect(container.querySelectorAll('td').length).toBeGreaterThan(0);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('時刻ヘッダ (00-23) を表示する', () => {
    render(<HeatmapTable heatmap={[]} />);
    expect(screen.getByText('00')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();
  });
});
