// 職員室ノートのコメント吹き出し (JournalCommentThread) の単体テスト。
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  JournalCommentThread,
  type ThreadComment,
} from '@/features/journal/components/JournalCommentThread';

function makeComment(o: Partial<ThreadComment> = {}): ThreadComment {
  return {
    id: o.id ?? 'c1',
    userId: o.userId ?? 'u-other',
    authorName: o.authorName ?? '先生A',
    authorNickname: o.authorNickname ?? null,
    body: o.body ?? 'あるある〜！',
    createdAt: o.createdAt ?? '2026-07-02T00:00:00.000Z',
  };
}

const baseProps = {
  entryId: 'e1',
  comments: [] as ThreadComment[],
  selfUserId: 'u-self',
  canModerate: false,
  onAdd: vi.fn(),
  onDelete: vi.fn(),
};

describe('JournalCommentThread', () => {
  it('コメントを本文と著者名で描画する', () => {
    render(
      <JournalCommentThread
        {...baseProps}
        comments={[makeComment({ body: 'いい話', authorName: 'となりの先生' })]}
      />,
    );
    expect(screen.getByText('いい話')).toBeInTheDocument();
    expect(screen.getByText('となりの先生')).toBeInTheDocument();
  });

  it('入力して送ると onAdd が呼ばれ、入力が空になる', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(<JournalCommentThread {...baseProps} onAdd={onAdd} />);
    const input = screen.getByPlaceholderText('コメントする');
    fireEvent.change(input, { target: { value: 'わたしもある！' } });
    fireEvent.click(screen.getByRole('button', { name: '送る' }));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith('e1', 'わたしもある！'),
    );
    await waitFor(() =>
      expect(
        (screen.getByPlaceholderText('コメントする') as HTMLInputElement)
          .value,
      ).toBe(''),
    );
  });

  it('空欄では送るが disabled', () => {
    render(<JournalCommentThread {...baseProps} />);
    expect(screen.getByRole('button', { name: '送る' })).toBeDisabled();
  });

  it('自分のコメントは削除ボタンを出し onDelete が呼ばれる', () => {
    const onDelete = vi.fn();
    render(
      <JournalCommentThread
        {...baseProps}
        onDelete={onDelete}
        comments={[makeComment({ id: 'cX', userId: 'u-self' })]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'コメントを削除' }));
    expect(onDelete).toHaveBeenCalledWith('e1', 'cX');
  });

  it('他人のコメントは削除ボタンを出さない (moderate 権限なし)', () => {
    render(
      <JournalCommentThread
        {...baseProps}
        comments={[makeComment({ userId: 'u-other' })]}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'コメントを削除' }),
    ).not.toBeInTheDocument();
  });

  it('school_admin (canModerate) は他人のコメントも削除できる', () => {
    render(
      <JournalCommentThread
        {...baseProps}
        canModerate
        comments={[makeComment({ userId: 'u-other' })]}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'コメントを削除' }),
    ).toBeInTheDocument();
  });
});
