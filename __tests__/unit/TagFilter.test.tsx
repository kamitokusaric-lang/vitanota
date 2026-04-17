import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagFilter } from '@/features/journal/components/TagFilter';
import type { Tag } from '@/db/schema';

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: overrides.id ?? 'tag-1',
    tenantId: 'tenant-1',
    name: overrides.name ?? 'default',
    type: overrides.type ?? 'context',
    category: overrides.category ?? null,
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

  it('全タグが表示される（上限なし）', () => {
    const tags = Array.from({ length: 30 }, (_, i) =>
      makeTag({ id: `t${i}`, name: `tag${i}`, sortOrder: i })
    );
    render(<TagFilter tags={tags} selectedTagIds={[]} onChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(30);
  });

  it('検索テキストボックスは表示されない', () => {
    const tags = Array.from({ length: 30 }, (_, i) =>
      makeTag({ id: `t${i}`, name: `tag${i}` })
    );
    render(<TagFilter tags={tags} selectedTagIds={[]} onChange={vi.fn()} />);
    expect(screen.queryByTestId('tag-filter-input')).toBeNull();
  });

  it('タグが0件の場合は「該当するタグがありません」', () => {
    render(<TagFilter tags={[]} selectedTagIds={[]} onChange={vi.fn()} />);
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

  it('タグ選択に上限がない', () => {
    const onChange = vi.fn();
    const selected = Array.from({ length: 15 }, (_, i) => `t${i}`);
    const tags = Array.from({ length: 20 }, (_, i) =>
      makeTag({ id: `t${i}`, name: `tag${i}` })
    );
    render(
      <TagFilter tags={tags} selectedTagIds={selected} onChange={onChange} />
    );
    fireEvent.click(screen.getByTestId('tag-filter-t15'));
    expect(onChange).toHaveBeenCalledWith([...selected, 't15']);
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
      '2 件選択中'
    );
  });

  it('感情タグとコンテキストタグがグループ分けされる', () => {
    const tags = [
      makeTag({ id: 't1', name: '喜び', type: 'emotion', category: 'positive', sortOrder: 1 }),
      makeTag({ id: 't2', name: '不安', type: 'emotion', category: 'negative', sortOrder: 2 }),
      makeTag({ id: 't3', name: '授業', type: 'context', sortOrder: 3 }),
    ];
    render(<TagFilter tags={tags} selectedTagIds={[]} onChange={vi.fn()} />);
    expect(screen.getByTestId('entry-form-emotion-tags')).toBeTruthy();
    expect(screen.getByTestId('entry-form-context-tags')).toBeTruthy();
  });
});
