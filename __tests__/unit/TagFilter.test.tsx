import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagFilter } from '@/features/journal/components/TagFilter';
import type { Tag } from '@/db/schema';

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: overrides.id ?? 'tag-1',
    tenantId: 'tenant-1',
    name: overrides.name ?? 'default',
    isEmotion: overrides.isEmotion ?? false,
    isSystemDefault: false,
    sortOrder: overrides.sortOrder ?? 0,
    createdBy: null,
    createdAt: new Date(),
  } as Tag;
}

describe('TagFilter', () => {
  it('タグを sort_order → name 順に表示する', () => {
    const tags = [
      makeTag({ id: 't3', name: 'うれしい', sortOrder: 1 }),
      makeTag({ id: 't1', name: 'あとで相談', sortOrder: 3 }),
      makeTag({ id: 't2', name: 'つかれた', sortOrder: 2 }),
    ];
    render(<TagFilter tags={tags} selectedTagIds={[]} onChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      'うれしい',
      'つかれた',
      'あとで相談',
    ]);
  });

  it('20件以下ならフィルタ入力は表示しない', () => {
    const tags = Array.from({ length: 15 }, (_, i) =>
      makeTag({ id: `t${i}`, name: `tag${i}` })
    );
    render(<TagFilter tags={tags} selectedTagIds={[]} onChange={vi.fn()} />);
    expect(screen.queryByTestId('tag-filter-input')).toBeNull();
  });

  it('20件超ならフィルタ入力が表示される', () => {
    const tags = Array.from({ length: 25 }, (_, i) =>
      makeTag({ id: `t${i}`, name: `tag${i}` })
    );
    render(<TagFilter tags={tags} selectedTagIds={[]} onChange={vi.fn()} />);
    expect(screen.getByTestId('tag-filter-input')).toBeTruthy();
  });

  it('初期表示は最大20件', () => {
    const tags = Array.from({ length: 30 }, (_, i) =>
      makeTag({ id: `t${i}`, name: `tag${i}`, sortOrder: i })
    );
    render(<TagFilter tags={tags} selectedTagIds={[]} onChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(20);
  });

  it('フィルタ入力時は includes で絞り込み（20件制限なし）', () => {
    const tags = Array.from({ length: 30 }, (_, i) =>
      makeTag({ id: `t${i}`, name: `abc${i}`, sortOrder: i })
    );
    render(<TagFilter tags={tags} selectedTagIds={[]} onChange={vi.fn()} />);
    const input = screen.getByTestId('tag-filter-input');
    fireEvent.change(input, { target: { value: 'abc2' } });
    // abc2, abc20..abc29 の 11 件
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(11);
  });

  it('該当なしの場合は「該当するタグがありません」', () => {
    const tags = Array.from({ length: 25 }, (_, i) =>
      makeTag({ id: `t${i}`, name: `abc${i}` })
    );
    render(<TagFilter tags={tags} selectedTagIds={[]} onChange={vi.fn()} />);
    fireEvent.change(screen.getByTestId('tag-filter-input'), {
      target: { value: 'xyz' },
    });
    expect(screen.getByText('該当するタグがありません')).toBeTruthy();
  });

  it('タグクリックで onChange が呼ばれる', () => {
    const onChange = vi.fn();
    const tags = [makeTag({ id: 't1', name: 'うれしい' })];
    render(<TagFilter tags={tags} selectedTagIds={[]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('tag-filter-t1'));
    expect(onChange).toHaveBeenCalledWith(['t1']);
  });

  it('選択済みタグをクリックすると解除される', () => {
    const onChange = vi.fn();
    const tags = [
      makeTag({ id: 't1', name: 'うれしい' }),
      makeTag({ id: 't2', name: 'つかれた' }),
    ];
    render(
      <TagFilter tags={tags} selectedTagIds={['t1', 't2']} onChange={onChange} />
    );
    fireEvent.click(screen.getByTestId('tag-filter-t1'));
    expect(onChange).toHaveBeenCalledWith(['t2']);
  });

  it('10件選択済みの状態で11件目を選択しても onChange は呼ばれない', () => {
    const onChange = vi.fn();
    const selected = Array.from({ length: 10 }, (_, i) => `t${i}`);
    const tags = Array.from({ length: 15 }, (_, i) =>
      makeTag({ id: `t${i}`, name: `tag${i}` })
    );
    render(
      <TagFilter tags={tags} selectedTagIds={selected} onChange={onChange} />
    );
    fireEvent.click(screen.getByTestId('tag-filter-t10'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('選択件数カウンターが表示される', () => {
    const tags = [
      makeTag({ id: 't1', name: 'a' }),
      makeTag({ id: 't2', name: 'b' }),
    ];
    render(
      <TagFilter tags={tags} selectedTagIds={['t1', 't2']} onChange={vi.fn()} />
    );
    expect(screen.getByTestId('tag-filter-count').textContent).toContain(
      '2 / 10'
    );
  });
});
