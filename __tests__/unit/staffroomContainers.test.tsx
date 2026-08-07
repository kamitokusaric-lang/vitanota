// staffroom の SWR コンテナ (StaffroomBoard / StudentSupportSection) の単体テスト。
// hooks を mock してデータ駆動の描画パスを通す。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/features/staffroom/hooks/useStaffroom', () => ({
  useStudentSupport: vi.fn(),
}));

// 2026-08-07: StaffroomBoard の先頭に学年会 (grade-meeting) が載った。
// ここでの関心は職員室ボード側なので、学年会は「クラスなし」の静止状態に固定して
// 描画に混ざらないようにする (学年会自体は gradeMeeting.test.tsx でカバー)。
vi.mock('@/features/grade-meeting/hooks/useGradeMeeting', () => ({
  useGradeMeeting: () => ({
    board: {
      grade: 1,
      classes: [],
      meeting: null,
      impressions: [],
      previousMeeting: null,
      previousActions: [],
    },
    isLoading: false,
    error: undefined,
    mutate: vi.fn(),
    startMeeting: vi.fn(),
    addNote: vi.fn(),
    deleteNote: vi.fn(),
  }),
}));

import {
  useStudentSupport,
  type SupportClass,
} from '@/features/staffroom/hooks/useStaffroom';
import { StaffroomBoard } from '@/features/staffroom/components/StaffroomBoard';
import { StudentSupportSection } from '@/features/staffroom/components/StudentSupportSection';

const mUseStudentSupport = vi.mocked(useStudentSupport);


beforeEach(() => {
  mUseStudentSupport.mockReturnValue({ classes: [], isLoading: false, error: undefined, mutate: vi.fn() } as ReturnType<typeof useStudentSupport>);
});

describe('StaffroomBoard', () => {
  // 2026-08-07: 「生徒の様子」と「情報共有」を撤去し、週ナビ + 学年会だけにした。
  it('週ナビと学年会だけを描画する', () => {
    render(<StaffroomBoard todayDate="2026-08-20" />);
    expect(screen.getByTestId('board-period-label')).toBeInTheDocument();
    expect(screen.getByTestId('grade-meeting-panel')).toBeInTheDocument();
  });

  it('撤去したセクションは出さない', () => {
    render(<StaffroomBoard todayDate="2026-08-20" />);
    expect(screen.queryByText('生徒の様子')).not.toBeInTheDocument();
    expect(screen.queryByText('情報共有')).not.toBeInTheDocument();
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
          { studentId: 's1', displayName: 'さくら', goodCount: 2, concernCount: 1, impressions: [{ sign: null, content: '朝、元気そう' }] },
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
