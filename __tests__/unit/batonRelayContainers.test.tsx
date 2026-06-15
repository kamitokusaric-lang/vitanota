// baton-relay の StudentRow (props 駆動) と BatonRelayBoard (SWR コンテナ) の単体テスト。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/shared/components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/features/baton-relay/hooks/useBatonRelay', () => ({
  useClasses: vi.fn(),
  useStudents: vi.fn(),
  useNotes: vi.fn(),
  useReactions: vi.fn(),
  useTeacherNames: vi.fn(),
}));

import {
  useClasses,
  useStudents,
  useNotes,
  useReactions,
  useTeacherNames,
} from '@/features/baton-relay/hooks/useBatonRelay';
import { StudentRow } from '@/features/baton-relay/components/StudentRow';
import { BatonRelayBoard } from '@/features/baton-relay/components/BatonRelayBoard';
import type { StudentDto, ClassDto } from '@/features/baton-relay/types';

const student: StudentDto = {
  id: 's1',
  classId: 'c1',
  displayName: 'さくら',
  status: 'active',
  enrolledAt: null,
  leftAt: null,
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T00:00:00.000Z',
};
const cls: ClassDto = {
  id: 'c1', name: '2-A', goalText: null, schoolYear: null,
  createdAt: '2026-06-15T00:00:00.000Z', updatedAt: '2026-06-15T00:00:00.000Z',
};

describe('StudentRow', () => {
  const baseProps = {
    student,
    notes: [],
    reactions: [],
    currentUserId: 'u1',
    nameById: new Map<string, string>(),
    classes: [cls],
    onToggleReaction: vi.fn(),
    onMoveStudent: vi.fn(),
    onAddNote: vi.fn(),
    onEditNote: vi.fn(),
    onDeleteNote: vi.fn(),
  };

  it('生徒名と 2 種の印ボタンを描画する', () => {
    render(<StudentRow {...baseProps} />);
    expect(screen.getByText('さくら')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Good/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /気になる/ })).toBeInTheDocument();
  });

  it('印ボタンで onToggleReaction が呼ばれる', () => {
    const onToggleReaction = vi.fn();
    render(<StudentRow {...baseProps} onToggleReaction={onToggleReaction} />);
    fireEvent.click(screen.getByRole('button', { name: /Good/ }));
    expect(onToggleReaction).toHaveBeenCalledWith('s1', 'positive');
  });

  it('一言を入力して残すと onAddNote が呼ばれる', async () => {
    const onAddNote = vi.fn().mockResolvedValue(undefined);
    render(<StudentRow {...baseProps} onAddNote={onAddNote} />);
    fireEvent.change(screen.getByPlaceholderText('ひとことを残す…'), { target: { value: '元気そう' } });
    fireEvent.click(screen.getByRole('button', { name: '残す' }));
    expect(onAddNote).toHaveBeenCalledWith('s1', '元気そう');
  });

  it('メニューを開き、他クラスがなければ「他のクラスがありません」', () => {
    render(<StudentRow {...baseProps} classes={[cls]} />);
    fireEvent.click(screen.getByTestId('student-menu-s1'));
    expect(screen.getByText('他のクラスがありません')).toBeInTheDocument();
  });

  it('他クラスがあれば移動ボタンを出し onMoveStudent が呼ばれる', () => {
    const onMoveStudent = vi.fn().mockResolvedValue(undefined);
    const other: ClassDto = { ...cls, id: 'c2', name: '2-B' };
    render(<StudentRow {...baseProps} classes={[cls, other]} onMoveStudent={onMoveStudent} />);
    fireEvent.click(screen.getByTestId('student-menu-s1'));
    fireEvent.click(screen.getByTestId('student-move-s1-c2'));
    expect(onMoveStudent).toHaveBeenCalledWith('s1', 'c2');
  });
});

describe('BatonRelayBoard (controlled・classId 指定)', () => {
  beforeEach(() => {
    vi.mocked(useClasses).mockReturnValue({ classes: [cls], isLoading: false, error: undefined, mutate: vi.fn() } as ReturnType<typeof useClasses>);
    vi.mocked(useStudents).mockReturnValue({ students: [student], mutate: vi.fn() } as unknown as ReturnType<typeof useStudents>);
    vi.mocked(useNotes).mockReturnValue({ notes: [], mutate: vi.fn() } as unknown as ReturnType<typeof useNotes>);
    vi.mocked(useReactions).mockReturnValue({ reactions: [], mutate: vi.fn() } as unknown as ReturnType<typeof useReactions>);
    vi.mocked(useTeacherNames).mockReturnValue(new Map());
  });

  it('クラス目標ヘッダと生徒行を描画する', () => {
    render(<BatonRelayBoard currentUserId="u1" todayDate="2026-06-15" classId="c1" />);
    expect(screen.getByText('2-A')).toBeInTheDocument(); // ClassGoalHeader
    expect(screen.getByText('さくら')).toBeInTheDocument(); // StudentRow
    expect(screen.getByText(/まとめて追加/)).toBeInTheDocument(); // RosterStudentBulkAdd
  });

  it('生徒がいなければ空メッセージを出す', () => {
    vi.mocked(useStudents).mockReturnValue({ students: [], mutate: vi.fn() } as unknown as ReturnType<typeof useStudents>);
    render(<BatonRelayBoard currentUserId="u1" todayDate="2026-06-15" classId="c1" />);
    expect(screen.getByText(/まだ生徒がいません/)).toBeInTheDocument();
  });

  it('読み込み中はスピナー', () => {
    vi.mocked(useClasses).mockReturnValue({ classes: [], isLoading: true, error: undefined, mutate: vi.fn() } as ReturnType<typeof useClasses>);
    render(<BatonRelayBoard currentUserId="u1" todayDate="2026-06-15" classId="c1" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
