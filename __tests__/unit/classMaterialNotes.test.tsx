// 学年会の「材料」= その週の生徒ノート (印 + 一言)。
//
// 落としたくない不変条件:
//   - クラス単位の合計を出さない (3クラス並ぶのでクラス間比較が立つ)
//   - 既定は畳んでおく (会議の主役は観察を出し合うこと)
//   - 指定クラスの生徒だけを出す
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('@/features/staffroom/hooks/useStaffroom', () => ({
  useStudentSupport: vi.fn(),
}));

import {
  useStudentSupport,
  type SupportClass,
} from '@/features/staffroom/hooks/useStaffroom';
import { ClassMaterialNotes } from '@/features/grade-meeting/components/ClassMaterialNotes';

const mUse = vi.mocked(useStudentSupport);
const PERIOD = { from: '2026-08-17', to: '2026-08-23' };

function supportClass(o: Partial<SupportClass> = {}): SupportClass {
  return {
    classId: o.classId ?? 'c1',
    className: o.className ?? '1-A',
    schoolYear: o.schoolYear ?? null,
    students: o.students ?? [],
  };
}

function mockClasses(classes: SupportClass[], isLoading = false) {
  mUse.mockReturnValue({
    classes,
    isLoading,
    error: undefined,
    mutate: vi.fn(),
  } as ReturnType<typeof useStudentSupport>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockClasses([]);
});

describe('ClassMaterialNotes', () => {
  it('読み込み中は何も描画しない', () => {
    mockClasses([], true);
    const { container } = render(
      <ClassMaterialNotes classId="c1" period={PERIOD} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('既定は畳まれていて、中身を出さない', () => {
    mockClasses([
      supportClass({
        students: [
          {
            studentId: 's1',
            displayName: '山田',
            goodCount: 1,
            concernCount: 0,
            impressions: [{ sign: null, content: 'よく発言していた' }],
          },
        ],
      }),
    ]);
    render(<ClassMaterialNotes classId="c1" period={PERIOD} />);
    expect(screen.queryByTestId('class-material-list-c1')).not.toBeInTheDocument();
    // 畳んだ状態でも人数だけは見える
    expect(screen.getByText('1人')).toBeInTheDocument();
  });

  it('ひらくと生徒・印・一言を出す', () => {
    mockClasses([
      supportClass({
        students: [
          {
            studentId: 's1',
            displayName: '山田',
            goodCount: 2,
            concernCount: 1,
            impressions: [{ sign: null, content: 'よく発言していた' }, { sign: null, content: '休み時間は教室にいた' }],
          },
        ],
      }),
    ]);
    render(<ClassMaterialNotes classId="c1" period={PERIOD} />);
    fireEvent.click(screen.getByTestId('class-material-toggle-c1'));
    const list = screen.getByTestId('class-material-list-c1');
    expect(within(list).getByText('山田')).toBeInTheDocument();
    expect(within(list).getByText('よく発言していた')).toBeInTheDocument();
    expect(within(list).getByText('休み時間は教室にいた')).toBeInTheDocument();
  });

  it('指定クラスの生徒だけを出す', () => {
    mockClasses([
      supportClass({
        classId: 'c1',
        students: [
          {
            studentId: 's1',
            displayName: 'A組の子',
            goodCount: 0,
            concernCount: 0,
            impressions: [],
          },
        ],
      }),
      supportClass({
        classId: 'c2',
        students: [
          {
            studentId: 's2',
            displayName: 'B組の子',
            goodCount: 0,
            concernCount: 0,
            impressions: [],
          },
        ],
      }),
    ]);
    render(<ClassMaterialNotes classId="c1" period={PERIOD} />);
    fireEvent.click(screen.getByTestId('class-material-toggle-c1'));
    expect(screen.getByText('A組の子')).toBeInTheDocument();
    expect(screen.queryByText('B組の子')).not.toBeInTheDocument();
  });

  // ── 踏み絵 ──────────────────────────────────────────────
  it('クラス単位の合計を出さない (クラス間の比較を立てない)', () => {
    mockClasses([
      supportClass({
        students: [
          {
            studentId: 's1',
            displayName: '山田',
            goodCount: 2,
            concernCount: 1,
            impressions: [],
          },
          {
            studentId: 's2',
            displayName: '佐藤',
            goodCount: 3,
            concernCount: 2,
            impressions: [],
          },
        ],
      }),
    ]);
    render(<ClassMaterialNotes classId="c1" period={PERIOD} />);
    fireEvent.click(screen.getByTestId('class-material-toggle-c1'));
    const section = screen.getByTestId('class-material-c1');
    // 生徒ごとの印 (2/1/3/2) は出るが、合計 (5 や 3) は描かない
    expect(within(section).queryByText('5')).not.toBeInTheDocument();
    expect(within(section).queryByText('3人')).not.toBeInTheDocument();
  });

  it('コメントに Good / 気になる が紐づいて出る', () => {
    mockClasses([
      supportClass({
        students: [
          {
            studentId: 's1',
            displayName: '山田',
            goodCount: 1,
            concernCount: 1,
            impressions: [
              { sign: 'good', content: 'よく発言していた' },
              { sign: 'concern', content: '休み時間ひとりでいた' },
            ],
          },
        ],
      }),
    ]);
    render(<ClassMaterialNotes classId="c1" period={PERIOD} />);
    fireEvent.click(screen.getByTestId('class-material-toggle-c1'));
    const list = screen.getByTestId('class-material-list-c1');
    // それぞれのコメントに、そのときのサインが添う
    const good = within(list).getByText('よく発言していた').closest('li')!;
    const concern = within(list).getByText('休み時間ひとりでいた').closest('li')!;
    expect(within(good).getByLabelText('Good')).toBeInTheDocument();
    expect(within(concern).getByLabelText('気になる')).toBeInTheDocument();
  });

  it('サインだけの行はコメント欄に出さない (カウントに出る)', () => {
    mockClasses([
      supportClass({
        students: [
          {
            studentId: 's1',
            displayName: '山田',
            goodCount: 1,
            concernCount: 0,
            impressions: [{ sign: 'good', content: null }],
          },
        ],
      }),
    ]);
    render(<ClassMaterialNotes classId="c1" period={PERIOD} />);
    fireEvent.click(screen.getByTestId('class-material-toggle-c1'));
    const list = screen.getByTestId('class-material-list-c1');
    expect(within(list).getByText('山田')).toBeInTheDocument();
    expect(within(list).queryAllByRole('listitem')).toHaveLength(1);
  });

  it('その週に生徒ノートが無ければ、その旨だけ出す', () => {
    mockClasses([supportClass({ students: [] })]);
    render(<ClassMaterialNotes classId="c1" period={PERIOD} />);
    expect(screen.getByText('まだありません')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('class-material-toggle-c1'));
    expect(
      screen.getByText('この週に書かれた生徒ノートはまだありません。'),
    ).toBeInTheDocument();
  });

  it('表示中の週で生徒ノートを引く', () => {
    render(<ClassMaterialNotes classId="c1" period={PERIOD} />);
    expect(mUse).toHaveBeenCalledWith(PERIOD);
  });
});
