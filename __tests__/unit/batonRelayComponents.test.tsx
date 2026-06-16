// baton-relay の props 駆動コンポーネント (RosterAdd / ClassGoalHeader / BatonNoteItem) の単体テスト。
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RosterAdd } from '@/features/baton-relay/components/RosterAdd';
import { ClassGoalHeader } from '@/features/baton-relay/components/ClassGoalHeader';
import { BatonNoteItem } from '@/features/baton-relay/components/BatonNoteItem';
import type { ClassDto, BatonNoteDto } from '@/features/baton-relay/types';

function makeClass(o: Partial<ClassDto> = {}): ClassDto {
  return {
    id: o.id ?? 'c1',
    name: o.name ?? '2-A',
    goalText: o.goalText ?? null,
    schoolYear: o.schoolYear ?? null,
    createdAt: o.createdAt ?? '2026-06-15T00:00:00.000Z',
    updatedAt: o.updatedAt ?? '2026-06-15T00:00:00.000Z',
  };
}
function makeNote(o: Partial<BatonNoteDto> = {}): BatonNoteDto {
  return {
    id: o.id ?? 'n1',
    studentId: o.studentId ?? 's1',
    authorUserId: o.authorUserId ?? 'u1',
    noteDate: o.noteDate ?? '2026-06-15',
    content: o.content ?? '朝、元気そうでした',
    createdAt: o.createdAt ?? '2026-06-15T00:00:00.000Z',
    updatedAt: o.updatedAt ?? '2026-06-15T00:00:00.000Z',
  };
}

describe('RosterAdd', () => {
  it('クラスが無いとき開いた状態で、入力して作成すると onCreateClass が呼ばれる', async () => {
    const onCreateClass = vi.fn().mockResolvedValue(undefined);
    render(<RosterAdd classes={[]} onCreateClass={onCreateClass} />);

    fireEvent.change(screen.getByPlaceholderText(/クラス名/), { target: { value: '3-B' } });
    fireEvent.change(screen.getByPlaceholderText(/クラス目標/), { target: { value: '元気にあいさつ' } });
    fireEvent.click(screen.getByRole('button', { name: '作る' }));

    await waitFor(() => expect(onCreateClass).toHaveBeenCalledWith('3-B', '元気にあいさつ'));
  });

  it('クラス名が空なら作成ボタンは disabled', () => {
    render(<RosterAdd classes={[]} onCreateClass={vi.fn()} />);
    expect(screen.getByRole('button', { name: '作る' })).toBeDisabled();
  });

  it('alwaysOpen ではトグルを出さず入力欄を直接展開する', () => {
    render(<RosterAdd classes={[makeClass()]} onCreateClass={vi.fn()} alwaysOpen />);
    // 内側の「クラスを追加」トグルは出ない (親の「＋」タブが既に表現している)
    expect(screen.queryByRole('button', { name: 'クラスを追加' })).not.toBeInTheDocument();
    // 入力欄は最初から見えている
    expect(screen.getByPlaceholderText(/クラス名/)).toBeInTheDocument();
  });
});

describe('ClassGoalHeader', () => {
  it('目標を表示し、編集で onSaveGoal が呼ばれる', async () => {
    const onSaveGoal = vi.fn().mockResolvedValue(undefined);
    render(
      <ClassGoalHeader
        cls={makeClass({ name: '2-A', goalText: '今日の目標' })}
        onSaveGoal={onSaveGoal}
      />,
    );
    // 目標テキスト (ボタン) をクリック → 編集モード
    fireEvent.click(screen.getByText('今日の目標'));
    const input = screen.getByDisplayValue('今日の目標');
    fireEvent.change(input, { target: { value: '新しい目標' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSaveGoal).toHaveBeenCalledWith('新しい目標'));
  });

  it('目標未設定なら誘導文言を出す', () => {
    render(<ClassGoalHeader cls={makeClass({ goalText: null })} onSaveGoal={vi.fn()} />);
    expect(screen.getByText('タップして目標を書く')).toBeInTheDocument();
  });
});

describe('BatonNoteItem', () => {
  it('自分の行は編集・削除ボタンを出す', () => {
    render(
      <BatonNoteItem note={makeNote()} authorName="先生A" isMine onEdit={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText(/朝、元気そうでした/)).toBeInTheDocument();
    expect(screen.getByText(/先生A/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
  });

  it('他人の行は編集・削除ボタンを出さない', () => {
    render(
      <BatonNoteItem note={makeNote()} authorName="先生B" isMine={false} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument();
  });

  it('削除ボタンで onDelete が呼ばれる', () => {
    const onDelete = vi.fn();
    render(<BatonNoteItem note={makeNote({ id: 'nX' })} authorName="先生A" isMine onEdit={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(onDelete).toHaveBeenCalledWith('nX');
  });

  it('内容を変えずに保存しても onEdit を呼ばない (no-op ガード)', async () => {
    const onEdit = vi.fn();
    render(<BatonNoteItem note={makeNote({ content: 'そのまま' })} authorName="A" isMine onEdit={onEdit} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '編集' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onEdit).not.toHaveBeenCalled());
  });
});
