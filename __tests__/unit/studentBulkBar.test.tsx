// 選んだ生徒の一括操作バー。
//
// 落としたくない不変条件:
//   - 何も選んでいなければ出さない
//   - 削除は確認を挟み、**消える印象・コメントの合計**を見せる
//   - 移動先に「今いるクラス」を出さない
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { StudentBulkBar } from '@/features/baton-relay/components/StudentBulkBar';
import type { ClassDto } from '@/features/baton-relay/types';

function cls(id: string, name: string): ClassDto {
  return {
    id,
    name,
    goalText: null,
    schoolYear: null,
    grade: null,
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
  };
}

const baseProps = {
  selectedCount: 2,
  noteCountTotal: 0,
  classes: [cls('c1', '2-A'), cls('c2', '2-B')],
  currentClassId: 'c1',
  busy: false,
  onClear: vi.fn(),
  onMove: vi.fn().mockResolvedValue(undefined),
  onArchive: vi.fn().mockResolvedValue(undefined),
  onDelete: vi.fn().mockResolvedValue(undefined),
};

describe('StudentBulkBar', () => {
  it('何も選んでいなければ出さない', () => {
    const { container } = render(
      <StudentBulkBar {...baseProps} selectedCount={0} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('選択件数を出す', () => {
    render(<StudentBulkBar {...baseProps} />);
    expect(screen.getByTestId('student-bulk-count')).toHaveTextContent('2人を選択中');
  });

  it('削除は確認を挟む (押しただけでは消えない)', () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<StudentBulkBar {...baseProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('student-bulk-delete'));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('student-bulk-confirm-delete-ok'));
    expect(onDelete).toHaveBeenCalled();
  });

  it('削除確認に、消える印象・コメントの合計を出す', () => {
    render(<StudentBulkBar {...baseProps} selectedCount={3} noteCountTotal={7} />);
    fireEvent.click(screen.getByTestId('student-bulk-delete'));
    const box = screen.getByTestId('student-bulk-confirm-delete');
    expect(box).toHaveTextContent('生徒 3 人');
    expect(box).toHaveTextContent('印象・コメント 7 件');
    expect(box).toHaveTextContent('取り消せません');
  });

  it('印象が無ければ件数を出さない', () => {
    render(<StudentBulkBar {...baseProps} noteCountTotal={0} />);
    fireEvent.click(screen.getByTestId('student-bulk-delete'));
    expect(screen.getByTestId('student-bulk-confirm-delete')).not.toHaveTextContent(
      '印象・コメント',
    );
  });

  it('移動先に「今いるクラス」を出さない', () => {
    render(<StudentBulkBar {...baseProps} />);
    fireEvent.click(screen.getByTestId('student-bulk-move'));
    const targets = screen.getByTestId('student-bulk-move-targets');
    expect(within(targets).getByTestId('student-bulk-move-to-c2')).toBeInTheDocument();
    expect(
      within(targets).queryByTestId('student-bulk-move-to-c1'),
    ).not.toBeInTheDocument();
  });

  it('移動先を選ぶとクラス ID 付きで呼ばれる', () => {
    const onMove = vi.fn().mockResolvedValue(undefined);
    render(<StudentBulkBar {...baseProps} onMove={onMove} />);
    fireEvent.click(screen.getByTestId('student-bulk-move'));
    fireEvent.click(screen.getByTestId('student-bulk-move-to-c2'));
    expect(onMove).toHaveBeenCalledWith('c2');
  });

  it('アーカイブも確認を挟む', () => {
    const onArchive = vi.fn().mockResolvedValue(undefined);
    render(<StudentBulkBar {...baseProps} onArchive={onArchive} />);
    fireEvent.click(screen.getByTestId('student-bulk-archive'));
    expect(onArchive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('student-bulk-confirm-archive-ok'));
    expect(onArchive).toHaveBeenCalled();
  });
});
