// baton-relay の StudentRow (props 駆動) と BatonRelayBoard (SWR コンテナ) の単体テスト。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/shared/components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/features/baton-relay/hooks/useBatonRelay', () => ({
  useClasses: vi.fn(),
  useStudents: vi.fn(),
  useArchivedStudents: vi.fn(),
  useNotes: vi.fn(),
  useReactions: vi.fn(),
  useTeacherNames: vi.fn(),
}));

import {
  useClasses,
  useStudents,
  useArchivedStudents,
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
    onRenameStudent: vi.fn(),
    onArchiveStudent: vi.fn(),
    onAddNote: vi.fn(),
    onEditNote: vi.fn(),
    onDeleteNote: vi.fn(),
  };

  it('メニューから「氏名を編集」でインライン入力し、保存で onRenameStudent が呼ばれる', async () => {
    const onRenameStudent = vi.fn().mockResolvedValue(undefined);
    render(<StudentRow {...baseProps} onRenameStudent={onRenameStudent} />);
    fireEvent.click(screen.getByTestId('student-menu-s1'));
    fireEvent.click(screen.getByTestId('student-rename-s1'));
    const input = screen.getByTestId('student-name-input-s1');
    fireEvent.change(input, { target: { value: 'さくら(改名)' } });
    fireEvent.click(screen.getByTestId('student-name-save-s1'));
    expect(onRenameStudent).toHaveBeenCalledWith('s1', 'さくら(改名)');
  });

  it('「アーカイブする」は 2 段確認の後に onArchiveStudent が呼ばれる', () => {
    const onArchiveStudent = vi.fn().mockResolvedValue(undefined);
    render(<StudentRow {...baseProps} onArchiveStudent={onArchiveStudent} />);
    fireEvent.click(screen.getByTestId('student-menu-s1'));
    fireEvent.click(screen.getByTestId('student-archive-s1'));
    // 1 段目では呼ばれない
    expect(onArchiveStudent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('student-archive-confirm-s1'));
    expect(onArchiveStudent).toHaveBeenCalledWith('s1');
  });

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

  it('「コメントを追加」で入力欄を開き、残すと onAddNote が呼ばれる', async () => {
    const onAddNote = vi.fn().mockResolvedValue(undefined);
    render(<StudentRow {...baseProps} onAddNote={onAddNote} />);
    // 既定は畳まれている。まず入力欄を開く。
    fireEvent.click(screen.getByRole('button', { name: /コメントを追加/ }));
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
    vi.mocked(useArchivedStudents).mockReturnValue({ archived: [], mutate: vi.fn() } as unknown as ReturnType<typeof useArchivedStudents>);
    vi.mocked(useNotes).mockReturnValue({ notes: [], mutate: vi.fn() } as unknown as ReturnType<typeof useNotes>);
    vi.mocked(useReactions).mockReturnValue({ reactions: [], mutate: vi.fn() } as unknown as ReturnType<typeof useReactions>);
    vi.mocked(useTeacherNames).mockReturnValue(new Map());
  });

  it('クラス目標ヘッダと生徒行を描画する', () => {
    render(<BatonRelayBoard currentUserId="u1" todayDate="2026-06-15" classId="c1" />);
    expect(screen.getByText('クラス目標')).toBeInTheDocument(); // ClassGoalHeader
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
