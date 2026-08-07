// 研修 (workshop) パネルの単体テスト。
// useWorkshop を mock して、描画パスと踏み絵の不変条件を固定する。
//
// 特に落としたくないもの:
//   - 未記入の班を並べない (進捗管理の見た目にしない)
//   - 「最後に書いた人」を出さない (入力係を可視化しない)
//   - 空欄は見出しごと描画しない (ポスターに穴を空けない)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('@/features/workshop/hooks/useWorkshop', () => ({
  useWorkshop: vi.fn(),
}));

import {
  useWorkshop,
  type WorkshopBoardDto,
  type WorkshopTeamReflectionDto,
} from '@/features/workshop/hooks/useWorkshop';
import { WorkshopPanel } from '@/features/workshop/components/WorkshopPanel';
import { WORKSHOP } from '@/features/workshop/constants';

const mUseWorkshop = vi.mocked(useWorkshop);

const submitCheckin = vi.fn();
const postReflection = vi.fn();
const upsertTeamReflection = vi.fn();

function teamReflection(
  o: Partial<WorkshopTeamReflectionDto> = {},
): WorkshopTeamReflectionDto {
  return {
    teamKey: o.teamKey ?? '1',
    change: o.change ?? '最初はバラバラだったが、3周目には役割が生まれた',
    moment: o.moment ?? 'A さんの一言で作り直した',
    motto: o.motto ?? 'まず全員で事実を言う',
    next: o.next ?? '学年会で、まず全員が一言ずつ',
    updatedAt: o.updatedAt ?? '2026-08-18T02:00:00.000Z',
    ...o,
  };
}

function board(o: Partial<WorkshopBoardDto> = {}): WorkshopBoardDto {
  return {
    workshop: o.workshop ?? WORKSHOP,
    myCheckin: o.myCheckin ?? null,
    checkins: o.checkins ?? [],
    reflections: o.reflections ?? [],
    teamReflections: o.teamReflections ?? [],
  };
}

function mockBoard(b: WorkshopBoardDto | undefined, over: Partial<ReturnType<typeof useWorkshop>> = {}) {
  mUseWorkshop.mockReturnValue({
    board: b,
    isLoading: false,
    error: undefined,
    mutate: vi.fn(),
    submitCheckin,
    postReflection,
    upsertTeamReflection,
    ...over,
  } as ReturnType<typeof useWorkshop>);
}

// チーム振り返りセクションを開く (既定は折りたたみ)。
function openTeamSection() {
  fireEvent.click(screen.getByTestId('workshop-team-toggle'));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mockBoard(board());
});

describe('WorkshopPanel の骨格', () => {
  it('読み込み中は読み込み表示', () => {
    mockBoard(undefined, { isLoading: true });
    render(<WorkshopPanel />);
    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
  });

  it('エラー時は読み込めなかった旨を出す', () => {
    mockBoard(undefined, { isLoading: false, error: new Error('boom') });
    render(<WorkshopPanel />);
    expect(screen.getByText('研修を読み込めませんでした')).toBeInTheDocument();
  });

  it('研修タイトルと開催日時を出す', () => {
    render(<WorkshopPanel />);
    expect(screen.getByText(WORKSHOP.title)).toBeInTheDocument();
    expect(screen.getByText(WORKSHOP.schedule!)).toBeInTheDocument();
  });

  it('チェックインは最初から開いていて、問いが見えている', () => {
    render(<WorkshopPanel />);
    expect(screen.getByText(WORKSHOP.checkinQuestion)).toBeInTheDocument();
    expect(screen.getByTestId('workshop-checkin-input')).toBeInTheDocument();
  });

  it('チーム振り返り・個人の振り返りは最初は畳まれている', () => {
    render(<WorkshopPanel />);
    expect(screen.queryByTestId('workshop-team-picker')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workshop-reflection-input')).not.toBeInTheDocument();
  });
});

describe('チェックイン', () => {
  it('入力して押すと submitCheckin が呼ばれる', () => {
    render(<WorkshopPanel />);
    fireEvent.change(screen.getByTestId('workshop-checkin-input'), {
      target: { value: '売店のソフトクリーム' },
    });
    fireEvent.click(screen.getByTestId('workshop-checkin-submit'));
    expect(submitCheckin).toHaveBeenCalledWith('売店のソフトクリーム');
  });

  it('未入力では押せない', () => {
    render(<WorkshopPanel />);
    expect(screen.getByTestId('workshop-checkin-submit')).toBeDisabled();
  });

  it('回答ずみなら既存回答をプリフィルし、ボタンが「書き直す」になる', () => {
    mockBoard(
      board({
        myCheckin: { answer: '観覧車', updatedAt: '2026-08-17T00:00:00.000Z' },
      }),
    );
    render(<WorkshopPanel />);
    expect(screen.getByTestId('workshop-checkin-input')).toHaveValue('観覧車');
    expect(screen.getByTestId('workshop-checkin-submit')).toHaveTextContent('書き直す');
  });
});

describe('チーム振り返り', () => {
  it('班チップから班を選ぶと、その班の保存内容が入る', () => {
    mockBoard(
      board({
        teamReflections: [
          teamReflection({ teamKey: '2', motto: '迷ったら口に出す' }),
        ],
      }),
    );
    render(<WorkshopPanel />);
    openTeamSection();
    fireEvent.click(screen.getByTestId('workshop-team-pick-2'));
    expect(screen.getByTestId('workshop-team-input-motto')).toHaveValue(
      '迷ったら口に出す',
    );
  });

  it('4問すべて空なら保存ボタンを押せない', () => {
    render(<WorkshopPanel />);
    openTeamSection();
    expect(screen.getByTestId('workshop-team-submit')).toBeDisabled();
  });

  it('1問でも書けば保存でき、班キーと4問が渡る', () => {
    render(<WorkshopPanel />);
    openTeamSection();
    fireEvent.change(screen.getByTestId('workshop-team-input-motto'), {
      target: { value: 'とりあえず作ってみる' },
    });
    fireEvent.click(screen.getByTestId('workshop-team-submit'));
    expect(upsertTeamReflection).toHaveBeenCalledWith({
      teamKey: '1',
      change: '',
      moment: '',
      motto: 'とりあえず作ってみる',
      next: '',
    });
  });

  it('打つそばからポスターに反映される (保存前のドラフト)', () => {
    render(<WorkshopPanel />);
    openTeamSection();
    fireEvent.change(screen.getByTestId('workshop-team-input-motto'), {
      target: { value: '先に決める' },
    });
    const poster = screen.getByTestId('workshop-team-poster-1');
    expect(within(poster).getByText('「先に決める」')).toBeInTheDocument();
  });

  it('選んだ班を localStorage に覚える', () => {
    render(<WorkshopPanel />);
    openTeamSection();
    fireEvent.click(screen.getByTestId('workshop-team-pick-3'));
    expect(window.localStorage.getItem('vitanota.workshop.teamKey')).toBe('3');
  });

  // ── 踏み絵 ──────────────────────────────────────────────
  it('未記入の班はポスター一覧に並ばない (進捗管理の見た目にしない)', () => {
    mockBoard(
      board({ teamReflections: [teamReflection({ teamKey: '2' })] }),
    );
    render(<WorkshopPanel />);
    openTeamSection();
    // 書かれた 2班 は出るが、未記入の 3班・4班 のポスターは無い
    expect(screen.getByTestId('workshop-team-poster-2')).toBeInTheDocument();
    expect(screen.queryByTestId('workshop-team-poster-3')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workshop-team-poster-4')).not.toBeInTheDocument();
  });

  it('4問すべて空の保存済み行は、書かれた班として扱わない', () => {
    mockBoard(
      board({
        teamReflections: [
          teamReflection({ teamKey: '2', change: '', moment: '', motto: '', next: '' }),
        ],
      }),
    );
    render(<WorkshopPanel />);
    openTeamSection();
    expect(screen.queryByTestId('workshop-team-present')).not.toBeInTheDocument();
  });
});

describe('発表用ポスター', () => {
  it('空欄は見出しごと描画しない (穴を空けない)', () => {
    mockBoard(
      board({
        teamReflections: [
          teamReflection({ teamKey: '2', moment: '', next: '' }),
        ],
      }),
    );
    render(<WorkshopPanel />);
    openTeamSection();
    const poster = screen.getByTestId('workshop-team-poster-2');
    expect(within(poster).getByText('チームの変化')).toBeInTheDocument();
    expect(
      within(poster).queryByText('チームだから起きた瞬間'),
    ).not.toBeInTheDocument();
    expect(within(poster).queryByText('仕事で活かせること')).not.toBeInTheDocument();
  });

  it('合言葉が未記入なら班名を主役にする', () => {
    mockBoard(
      board({ teamReflections: [teamReflection({ teamKey: '2', motto: '' })] }),
    );
    render(<WorkshopPanel />);
    openTeamSection();
    const poster = screen.getByTestId('workshop-team-poster-2');
    expect(within(poster).getByText('2班')).toBeInTheDocument();
  });

  it('ポスターは4問と班名だけを出す (書いた人・更新時刻を足さない)', () => {
    // 本文そのものに人名が入ることはある (「A さんの一言で」など) ので、
    // 語句の有無ではなく「4問と班名以外を描画していないこと」で固定する。
    const r = teamReflection({
      teamKey: '2',
      change: 'カワル',
      moment: 'シュンカン',
      motto: 'アイコトバ',
      next: 'ツギ',
    });
    mockBoard(board({ teamReflections: [r] }));
    render(<WorkshopPanel />);
    openTeamSection();
    const poster = screen.getByTestId('workshop-team-poster-2');
    expect(poster.textContent).toBe(
      [
        '2班',
        '「アイコトバ」',
        'チームの変化',
        'カワル',
        'チームだから起きた瞬間',
        'シュンカン',
        '仕事で活かせること',
        'ツギ',
      ].join(''),
    );
  });
});

describe('発表モード', () => {
  it('書かれた班が無ければ「発表する」を出さない', () => {
    render(<WorkshopPanel />);
    openTeamSection();
    expect(screen.queryByTestId('workshop-team-present')).not.toBeInTheDocument();
  });

  it('発表するを押すと全画面が開き、班をめくれる', () => {
    mockBoard(
      board({
        teamReflections: [
          teamReflection({ teamKey: '1', motto: '1班の合言葉' }),
          teamReflection({ teamKey: '3', motto: '3班の合言葉' }),
        ],
      }),
    );
    render(<WorkshopPanel />);
    openTeamSection();
    fireEvent.click(screen.getByTestId('workshop-team-present'));

    const stage = screen.getByTestId('workshop-team-stage');
    expect(within(stage).getByText('1 / 2')).toBeInTheDocument();
    expect(within(stage).getByText('「1班の合言葉」')).toBeInTheDocument();

    fireEvent.click(within(stage).getByLabelText('次の班'));
    expect(within(stage).getByText('2 / 2')).toBeInTheDocument();
    expect(within(stage).getByText('「3班の合言葉」')).toBeInTheDocument();
  });

  it('矢印キーでめくれて、Esc で閉じる', () => {
    mockBoard(
      board({
        teamReflections: [
          teamReflection({ teamKey: '1', motto: '1班の合言葉' }),
          teamReflection({ teamKey: '2', motto: '2班の合言葉' }),
        ],
      }),
    );
    render(<WorkshopPanel />);
    openTeamSection();
    fireEvent.click(screen.getByTestId('workshop-team-present'));

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(
      within(screen.getByTestId('workshop-team-stage')).getByText('2 / 2'),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(
      within(screen.getByTestId('workshop-team-stage')).getByText('1 / 2'),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('workshop-team-stage')).not.toBeInTheDocument();
  });
});

describe('個人の振り返り', () => {
  it('ひらくと入力でき、投稿すると postReflection が呼ばれる', () => {
    render(<WorkshopPanel />);
    fireEvent.click(screen.getByTestId('workshop-reflection-toggle'));
    fireEvent.change(screen.getByTestId('workshop-reflection-input'), {
      target: { value: '持ち帰りたいこと' },
    });
    fireEvent.click(screen.getByTestId('workshop-reflection-submit'));
    expect(postReflection).toHaveBeenCalledWith('持ち帰りたいこと');
  });

  it('職員室にも公開されることを明示する', () => {
    render(<WorkshopPanel />);
    fireEvent.click(screen.getByTestId('workshop-reflection-toggle'));
    expect(
      screen.getByText(/職員室ノートにも公開されます/),
    ).toBeInTheDocument();
  });
});
