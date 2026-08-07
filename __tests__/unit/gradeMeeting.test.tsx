// 学年会 (grade-meeting) の UI 単体テスト。
//
// 特に落としたくない不変条件:
//   - 観察も状況判断も**複数のまま並ぶ** (1つに畳まない = 設計の核)
//   - 誰が出したかをどこにも描かない (無記名)
//   - 前回の一手は**表示するだけ** (できた/できなかったを採らない)
//   - 件数・スコアを出さない (クラス間の比較を誘発しない)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('@/features/grade-meeting/hooks/useGradeMeeting', () => ({
  useGradeMeeting: vi.fn(),
}));

// 材料として出す生徒ノート。既定は空 (材料テストで個別に差し替える)。
vi.mock('@/features/staffroom/hooks/useStaffroom', () => ({
  useStudentSupport: vi.fn(() => ({
    classes: [],
    isLoading: false,
    error: undefined,
    mutate: vi.fn(),
  })),
}));

// 「やること」は既存タスクとして起こすので、カテゴリ取得を固定する。
vi.mock('@/features/tasks/hooks/useTaskCategories', () => ({
  useTaskCategories: () => ({
    categories: [
      { id: 'cat1', name: '学年・学級' },
      { id: 'cat2', name: '学校行事' },
    ],
    error: undefined,
    isLoading: false,
  }),
}));

import {
  useGradeMeeting,
  type ClassNoteDto,
  type GradeMeetingBoardDto,
} from '@/features/grade-meeting/hooks/useGradeMeeting';
import { ClassStatusCard } from '@/features/grade-meeting/components/ClassStatusCard';
import { GradeMeetingPanel } from '@/features/grade-meeting/components/GradeMeetingPanel';

const mUseGradeMeeting = vi.mocked(useGradeMeeting);
const startMeeting = vi.fn();
const addNote = vi.fn();
const deleteNote = vi.fn();
const createGradeTask = vi.fn();
const unlinkGradeTask = vi.fn();

const TODAY = '2026-08-20';
// TODAY を含む週 / 含まない過去の週
const THIS_WEEK = { from: '2026-08-17', to: '2026-08-23' };
const PAST_WEEK = { from: '2026-08-10', to: '2026-08-16' };

function note(o: Partial<ClassNoteDto> = {}): ClassNoteDto {
  return {
    id: o.id ?? 'n1',
    classId: o.classId ?? 'c1',
    kind: o.kind ?? 'observe',
    content: o.content ?? '教室に残る子が増えた',
    createdAt: o.createdAt ?? '2026-08-20T01:00:00.000Z',
    ...o,
  };
}

// null を渡して「会がまだ無い」を表現するため、?? ではなく undefined 判定で既定値を入れる
// (?? だと null が既定値に潰れてしまう)。
function board(o: Partial<GradeMeetingBoardDto> = {}): GradeMeetingBoardDto {
  return {
    grade: o.grade ?? 1,
    availableGrades: o.availableGrades ?? [1, 2, 3],
    classes: o.classes ?? [{ id: 'c1', name: '1-A', goalText: null }],
    meeting:
      o.meeting !== undefined ? o.meeting : { id: 'm1', grade: 1, heldOn: TODAY },
    notes: o.notes ?? [],
    previousMeeting: o.previousMeeting !== undefined ? o.previousMeeting : null,
    previousActions: o.previousActions ?? [],
    gradeTasks: o.gradeTasks ?? [],
  };
}

function mockBoard(
  b: GradeMeetingBoardDto | undefined,
  over: Partial<ReturnType<typeof useGradeMeeting>> = {},
) {
  mUseGradeMeeting.mockReturnValue({
    board: b,
    isLoading: false,
    error: undefined,
    mutate: vi.fn(),
    startMeeting,
    addNote,
    deleteNote,
    createGradeTask,
    unlinkGradeTask,
    ...over,
  } as ReturnType<typeof useGradeMeeting>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBoard(board());
});

const klass = { id: 'c1', name: '1-A', goalText: null };

describe('ClassStatusCard', () => {
  it('3段 (観察 / 状況判断 / 次の一手) の見出しを出す', () => {
    render(
      <ClassStatusCard
        klass={klass}
        period={THIS_WEEK}
        notes={[]}
        previousAction={null}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('事実として観察したこと')).toBeInTheDocument();
    expect(screen.getByText('どんな判断をする？')).toBeInTheDocument();
    expect(screen.getByText('次に小さく試してみること')).toBeInTheDocument();
  });

  it('観察も状況判断も複数のまま並ぶ (1つに畳まない)', () => {
    render(
      <ClassStatusCard
        klass={klass}
        period={THIS_WEEK}
        notes={[
          note({ id: 'o1', kind: 'observe', content: '教室に残る子が増えた' }),
          note({ id: 'o2', kind: 'observe', content: '片付けが早くなった' }),
          note({ id: 'r1', kind: 'orient', content: '外に出づらい空気かも' }),
          note({ id: 'r2', kind: 'orient', content: '居心地がよくなったのかも' }),
        ]}
        previousAction={null}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const observes = screen.getByTestId('class-note-list-c1-observe');
    const orients = screen.getByTestId('class-note-list-c1-orient');
    expect(within(observes).getAllByRole('listitem')).toHaveLength(2);
    expect(within(orients).getAllByRole('listitem')).toHaveLength(2);
  });

  it('次の一手は1つだけ表示する', () => {
    render(
      <ClassStatusCard
        klass={klass}
        period={THIS_WEEK}
        notes={[note({ id: 'a1', kind: 'action', content: '席替えを試す' })]}
        previousAction={null}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const actions = screen.getByTestId('class-note-list-c1-action');
    expect(within(actions).getAllByRole('listitem')).toHaveLength(1);
  });

  it('前回の一手は表示するだけ (できた/できなかったを採らない)', () => {
    render(
      <ClassStatusCard
        klass={klass}
        period={THIS_WEEK}
        notes={[]}
        previousAction={note({
          id: 'p1',
          kind: 'action',
          content: '席の決め方を子どもに任せる',
        })}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const prev = screen.getByTestId('class-previous-action-c1');
    expect(within(prev).getByText('席の決め方を子どもに任せる')).toBeInTheDocument();
    // 達成度の選択肢を出さない
    expect(screen.queryByText(/できた|できなかった|一部/)).not.toBeInTheDocument();
    expect(prev.querySelectorAll('input,button')).toHaveLength(0);
  });

  it('誰が出したかをどこにも描かない (無記名)', () => {
    const { container } = render(
      <ClassStatusCard
        klass={klass}
        period={THIS_WEEK}
        notes={[
          note({ id: 'o1', kind: 'observe', content: 'アアア' }),
          note({ id: 'r1', kind: 'orient', content: 'イイイ' }),
        ]}
        previousAction={null}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(container.textContent).not.toMatch(/さん|先生|名前|投稿者/);
  });

  it('件数やスコアを出さない (クラス間の比較を誘発しない)', () => {
    render(
      <ClassStatusCard
        klass={klass}
        period={THIS_WEEK}
        notes={[
          note({ id: 'o1', kind: 'observe', content: 'アアア' }),
          note({ id: 'o2', kind: 'observe', content: 'イイイ' }),
          note({ id: 'o3', kind: 'observe', content: 'ウウウ' }),
        ]}
        previousAction={null}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const card = screen.getByTestId('class-status-card-c1');
    // 「3件」「3」のような件数表示を出していない
    expect(card.textContent).not.toMatch(/\d+\s*件/);
  });

  it('観察を出すと kind 付きで onAdd が呼ばれる', () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(
      <ClassStatusCard
        klass={klass}
        period={THIS_WEEK}
        notes={[]}
        previousAction={null}
        onAdd={onAdd}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId('class-note-input-c1-observe'), {
      target: { value: '給食の片付けが早くなった' },
    });
    fireEvent.click(screen.getByTestId('class-note-submit-c1-observe'));
    expect(onAdd).toHaveBeenCalledWith('observe', '給食の片付けが早くなった');
  });

  it('空では出せない', () => {
    render(
      <ClassStatusCard
        klass={klass}
        period={THIS_WEEK}
        notes={[]}
        previousAction={null}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByTestId('class-note-submit-c1-observe')).toBeDisabled();
  });
});

describe('GradeMeetingPanel', () => {
  it('学年チップは実データから作る (ハードコードしない)', () => {
    mockBoard(board({ availableGrades: [1, 2, 3] }));
    render(<GradeMeetingPanel todayDate={TODAY} period={THIS_WEEK} />);
    expect(screen.getByTestId('grade-pick-1')).toBeInTheDocument();
    expect(screen.getByTestId('grade-pick-3')).toBeInTheDocument();
    // 中学なら4年以降は出ない
    expect(screen.queryByTestId('grade-pick-4')).not.toBeInTheDocument();
    expect(screen.queryByTestId('grade-pick-6')).not.toBeInTheDocument();
  });

  it('小学校なら6年まで出る', () => {
    mockBoard(board({ availableGrades: [1, 2, 3, 4, 5, 6] }));
    render(<GradeMeetingPanel todayDate={TODAY} period={THIS_WEEK} />);
    expect(screen.getByTestId('grade-pick-6')).toBeInTheDocument();
  });

  it('学年を選べる', () => {
    render(<GradeMeetingPanel todayDate={TODAY} period={THIS_WEEK} />);
    fireEvent.click(screen.getByTestId('grade-pick-2'));
    expect(mUseGradeMeeting).toHaveBeenCalledWith(2, THIS_WEEK);
  });

  it('選択中の学年にクラスが無ければ、実在する先頭の学年へ寄せる', () => {
    mockBoard(board({ availableGrades: [2, 3] })); // 1年は存在しない
    render(<GradeMeetingPanel todayDate={TODAY} period={THIS_WEEK} />);
    expect(mUseGradeMeeting).toHaveBeenCalledWith(2, THIS_WEEK);
  });

  it('会がまだ無ければ「学年会をはじめる」を出す (自動では作らない)', () => {
    mockBoard(board({ meeting: null }));
    render(<GradeMeetingPanel todayDate={TODAY} period={THIS_WEEK} />);
    const start = screen.getByTestId('grade-meeting-start');
    expect(start).toBeInTheDocument();
    // 押すまで会は作られない
    expect(startMeeting).not.toHaveBeenCalled();
    fireEvent.click(start);
    expect(startMeeting).toHaveBeenCalledWith(TODAY);
  });

  it('学年にクラスが無ければ、学年を設定するよう案内する', () => {
    mockBoard(board({ classes: [], meeting: null, availableGrades: [] }));
    render(<GradeMeetingPanel todayDate={TODAY} period={THIS_WEEK} />);
    expect(
      screen.getByText(/学年が設定されたクラスがまだありません/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('grade-meeting-start')).not.toBeInTheDocument();
  });

  it('クラスカードをクラスの並び順どおりに出す', () => {
    mockBoard(
      board({
        classes: [
          { id: 'c1', name: '1-A', goalText: null },
          { id: 'c2', name: '1-B', goalText: null },
        ],
      }),
    );
    render(<GradeMeetingPanel todayDate={TODAY} period={THIS_WEEK} />);
    const cards = screen.getAllByTestId(/^class-status-card-/);
    expect(cards.map((c) => c.getAttribute('data-testid'))).toEqual([
      'class-status-card-c1',
      'class-status-card-c2',
    ]);
  });

  it('クラス目標を学年会の見出しの下にまとめて出す', () => {
    mockBoard(
      board({
        classes: [
          { id: 'c1', name: '1-A', goalText: 'あいさつがあふれるクラス' },
          { id: 'c2', name: '1-B', goalText: null },
        ],
      }),
    );
    render(<GradeMeetingPanel todayDate={TODAY} period={THIS_WEEK} />);
    const goals = screen.getByTestId('grade-class-goals');
    expect(within(goals).getByText('あいさつがあふれるクラス')).toBeInTheDocument();
    // 未設定のクラスも並べる (設定を促す)
    expect(within(goals).getByText('まだ決まっていません')).toBeInTheDocument();
  });

  it('どのクラスにも目標が無ければ、目標の枠ごと出さない', () => {
    mockBoard(
      board({ classes: [{ id: 'c1', name: '1-A', goalText: null }] }),
    );
    render(<GradeMeetingPanel todayDate={TODAY} period={THIS_WEEK} />);
    expect(screen.queryByTestId('grade-class-goals')).not.toBeInTheDocument();
  });

  it('クラスカードの見出しには目標を重ねない (上でまとめて出すため)', () => {
    mockBoard(
      board({
        classes: [{ id: 'c1', name: '1-A', goalText: 'あいさつがあふれるクラス' }],
      }),
    );
    render(<GradeMeetingPanel todayDate={TODAY} period={THIS_WEEK} />);
    const card = screen.getByTestId('class-status-card-c1');
    expect(within(card).queryByText('あいさつがあふれるクラス')).not.toBeInTheDocument();
  });

  it('前回の会があれば、その一手をクラスに紐づけて出す', () => {
    mockBoard(
      board({
        previousMeeting: { id: 'm0', grade: 1, heldOn: '2026-08-06' },
        previousActions: [
          note({
            id: 'p1',
            classId: 'c1',
            kind: 'action',
            content: '席の決め方を子どもに任せる',
          }),
        ],
      }),
    );
    render(<GradeMeetingPanel todayDate={TODAY} period={THIS_WEEK} />);
    expect(screen.getByTestId('class-previous-action-c1')).toHaveTextContent(
      '席の決め方を子どもに任せる',
    );
  });

  it('会の日が今日でなければ「今日の学年会をはじめる」を出す', () => {
    mockBoard(board({ meeting: { id: 'm1', grade: 1, heldOn: '2026-08-06' } }));
    render(<GradeMeetingPanel todayDate={TODAY} period={THIS_WEEK} />);
    expect(screen.getByTestId('grade-meeting-start-new')).toBeInTheDocument();
  });

  it('過去の週に会が無ければ、はじめるボタンを出さない (後から記録を作らない)', () => {
    mockBoard(board({ meeting: null }));
    render(<GradeMeetingPanel todayDate={TODAY} period={PAST_WEEK} />);
    expect(screen.queryByTestId('grade-meeting-start')).not.toBeInTheDocument();
    expect(screen.getByText(/この週に1年の学年会はありません/)).toBeInTheDocument();
  });

  it('過去の週の会は読めるが、はじめ直すボタンは出さない', () => {
    mockBoard(board({ meeting: { id: 'm0', grade: 1, heldOn: '2026-08-12' } }));
    render(<GradeMeetingPanel todayDate={TODAY} period={PAST_WEEK} />);
    expect(screen.getByTestId('class-status-card-c1')).toBeInTheDocument();
    expect(screen.queryByTestId('grade-meeting-start-new')).not.toBeInTheDocument();
  });

  it('表示中の週を hook に渡す (週をめくるとその週の会を引く)', () => {
    render(<GradeMeetingPanel todayDate={TODAY} period={PAST_WEEK} />);
    expect(mUseGradeMeeting).toHaveBeenCalledWith(1, PAST_WEEK);
  });

  // ── 学年の「やること」──────────────────────────────
  it('学年のやることを、クラスカードより前に出す', () => {
    render(<GradeMeetingPanel todayDate={TODAY} period={THIS_WEEK} />);
    const list = screen.getByTestId('grade-task-list');
    const card = screen.getByTestId('class-status-card-c1');
    // DOM 順で やること → クラスカード
    expect(
      list.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('やることを足すと、会 ID とカテゴリ付きで作られる', () => {
    render(<GradeMeetingPanel todayDate={TODAY} period={THIS_WEEK} />);
    fireEvent.change(screen.getByTestId('grade-task-title'), {
      target: { value: '運動会の役割分担' },
    });
    fireEvent.click(screen.getByTestId('grade-task-submit'));
    expect(createGradeTask).toHaveBeenCalledWith({
      meetingId: 'm1',
      categoryId: 'cat1', // 既定 = 先頭カテゴリ
      title: '運動会の役割分担',
      dueDate: undefined,
    });
  });



  it('やること一覧に期限と完了状態が出る', () => {
    mockBoard(
      board({
        gradeTasks: [
          {
            taskId: 't1',
            title: '学年通信を出す',
            dueDate: '2026-08-25',
            status: 'backlog',
            categoryId: 'cat1',
            assignees: [{ userId: 'u-self', name: '自分先生' }],
          },
          {
            taskId: 't2',
            title: '終わった仕事',
            dueDate: null,
            status: 'done',
            categoryId: 'cat1',
            assignees: [],
          },
        ],
      }),
    );
    render(<GradeMeetingPanel todayDate={TODAY} period={THIS_WEEK} />);
    const items = screen.getByTestId('grade-task-items');
    expect(within(items).getByText('学年通信を出す')).toBeInTheDocument();
    expect(within(items).getByText('8/25')).toBeInTheDocument();
    // 完了したものは打ち消し線
    expect(within(items).getByText('終わった仕事').className).toMatch(
      /line-through/,
    );
  });

  it('会の日が今日なら、はじめ直すボタンは出さない', () => {
    render(<GradeMeetingPanel todayDate={TODAY} period={THIS_WEEK} />);
    expect(screen.queryByTestId('grade-meeting-start-new')).not.toBeInTheDocument();
  });
});
