// staffroom の SWR コンテナ (StaffroomBoard / StudentSupportSection) の単体テスト。
// hooks を mock してデータ駆動の描画パスを通す。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/features/staffroom/hooks/useStaffroom', () => ({
  useBoards: vi.fn(),
  useTeacherNames: vi.fn(),
  useStudentSupport: vi.fn(),
}));

import {
  useBoards,
  useTeacherNames,
  useStudentSupport,
  type SupportClass,
} from '@/features/staffroom/hooks/useStaffroom';
import { StaffroomBoard } from '@/features/staffroom/components/StaffroomBoard';
import { StudentSupportSection } from '@/features/staffroom/components/StudentSupportSection';
import type { BoardDto } from '@/features/staffroom/types';

const mUseBoards = vi.mocked(useBoards);
const mUseTeacherNames = vi.mocked(useTeacherNames);
const mUseStudentSupport = vi.mocked(useStudentSupport);

function board(o: Partial<BoardDto> = {}): BoardDto {
  return {
    id: o.id ?? 'b1',
    authorUserId: o.authorUserId ?? 'u1',
    content: o.content ?? '本文',
    isPublic: o.isPublic ?? true,
    boardKind: o.boardKind ?? 'help',
    reactions: o.reactions ?? { knowledge: { count: 0, mine: false }, appreciation: { count: 0, mine: false }, endorsement: { count: 0, mine: false } },
    ...o,
  } as BoardDto;
}

beforeEach(() => {
  mUseTeacherNames.mockReturnValue(new Map([['u1', '田中先生']]));
  mUseStudentSupport.mockReturnValue({ classes: [], isLoading: false, error: undefined, mutate: vi.fn() } as ReturnType<typeof useStudentSupport>);
  mUseBoards.mockReturnValue({ boards: [], isLoading: false, error: undefined, mutate: vi.fn() } as ReturnType<typeof useBoards>);
});

describe('StaffroomBoard', () => {
  it('2 セクション (生徒の様子 / 情報共有) を描画する', () => {
    render(<StaffroomBoard />);
    expect(screen.getByText('生徒の様子')).toBeInTheDocument();
    expect(screen.getByText('情報共有')).toBeInTheDocument();
  });

  it('boards を kind の箱に振り分け、knowledge リアクション付きはナレッジ箱にも集計する', () => {
    mUseBoards.mockReturnValue({
      boards: [
        board({ id: 'b1', boardKind: 'help', content: '相談です' }),
        board({ id: 'b2', boardKind: 'thanks', content: 'ありがとう', reactions: { knowledge: { count: 2, mine: false }, appreciation: { count: 0, mine: false }, endorsement: { count: 0, mine: false } } }),
      ],
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    } as ReturnType<typeof useBoards>);
    render(<StaffroomBoard />);
    expect(screen.getByText('相談です')).toBeInTheDocument();
    // thanks 投稿は thanks 箱 + (なるほど集計で) ナレッジ箱の両方に出る → content が 2 回
    expect(screen.getAllByText('ありがとう').length).toBe(2);
  });

  it('loading 中はスピナー、error 時はエラーメッセージ', () => {
    mUseBoards.mockReturnValue({ boards: [], isLoading: true, error: undefined, mutate: vi.fn() } as ReturnType<typeof useBoards>);
    const { rerender } = render(<StaffroomBoard />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    mUseBoards.mockReturnValue({ boards: [], isLoading: false, error: new Error('x'), mutate: vi.fn() } as ReturnType<typeof useBoards>);
    rerender(<StaffroomBoard />);
    expect(screen.getByText('ボードの取得に失敗しました')).toBeInTheDocument();
  });
});

describe('StudentSupportSection', () => {
  it('loading 中は何も描画しない', () => {
    mUseStudentSupport.mockReturnValue({ classes: [], isLoading: true, error: undefined, mutate: vi.fn() } as ReturnType<typeof useStudentSupport>);
    const { container } = render(<StudentSupportSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('印が付いた生徒がいなければ「まだありません」', () => {
    render(<StudentSupportSection />);
    expect(screen.getByText('まだありません')).toBeInTheDocument();
  });

  it('クラス・生徒・印件数・一言を描画する', () => {
    const classes: SupportClass[] = [
      {
        classId: 'c1',
        className: '2-A',
        schoolYear: null,
        students: [
          { studentId: 's1', displayName: 'さくら', positiveCount: 2, concernCount: 1, notes: ['朝、元気そう'] },
        ],
      },
    ];
    mUseStudentSupport.mockReturnValue({ classes, isLoading: false, error: undefined, mutate: vi.fn() } as ReturnType<typeof useStudentSupport>);
    render(<StudentSupportSection />);
    expect(screen.getByText('2-A')).toBeInTheDocument();
    expect(screen.getByText('さくら')).toBeInTheDocument();
    expect(screen.getByText('朝、元気そう')).toBeInTheDocument();
  });
});
