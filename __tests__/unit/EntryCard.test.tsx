import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EntryCard, type EntryCardData } from '@/features/journal/components/EntryCard';

function makeEntry(overrides: Partial<EntryCardData> = {}): EntryCardData {
  return {
    id: 'e1',
    userId: 'u1',
    content: 'テスト本文',
    createdAt: new Date('2026-04-15T10:30:00+09:00'),
    ...overrides,
  };
}

describe('EntryCard', () => {
  it('基本情報（本文・日付）を表示する', () => {
    render(<EntryCard entry={makeEntry()} />);
    expect(screen.getByTestId('entry-card-e1')).toBeTruthy();
    expect(screen.getByTestId('entry-card-content-e1').textContent).toBe(
      'テスト本文'
    );
  });

  it('content は省略せず全文表示される (200 文字まで)', () => {
    const longContent = 'あ'.repeat(200);
    render(<EntryCard entry={makeEntry({ content: longContent })} />);
    const text = screen.getByTestId('entry-card-content-e1').textContent ?? '';
    expect(text).toBe(longContent);
    expect(text.endsWith('…')).toBe(false);
  });

  it('改行を含む content は whitespace-pre-wrap で保持される', () => {
    const content = '1 行目\n2 行目\n3 行目';
    render(<EntryCard entry={makeEntry({ content })} />);
    const text = screen.getByTestId('entry-card-content-e1').textContent ?? '';
    expect(text).toBe(content);
  });

  it('authorName がある場合は表示される', () => {
    render(<EntryCard entry={makeEntry({ authorName: '山田先生' })} />);
    expect(screen.getByTestId('entry-card-author-e1').textContent).toBe(
      '山田先生'
    );
  });

  it('authorName がない場合は author 要素が存在しない', () => {
    render(<EntryCard entry={makeEntry()} />);
    expect(screen.queryByTestId('entry-card-author-e1')).toBeNull();
  });

  it('showPrivacyBadge=true かつ isPublic=false でバッジ表示', () => {
    render(
      <EntryCard
        entry={makeEntry({ isPublic: false })}
        showPrivacyBadge
      />
    );
    expect(screen.getByTestId('entry-card-private-e1')).toBeTruthy();
  });

  it('isPublic=true のときはバッジを表示しない', () => {
    render(
      <EntryCard
        entry={makeEntry({ isPublic: true })}
        showPrivacyBadge
      />
    );
    expect(screen.queryByTestId('entry-card-private-e1')).toBeNull();
  });

  it('onEdit/onDelete なしのとき kebab メニューは表示しない', () => {
    render(<EntryCard entry={makeEntry()} />);
    expect(screen.queryByTestId('entry-card-menu-button-e1')).toBeNull();
  });

  it('onEdit 指定時は kebab → 編集メニューでコールバック', () => {
    const onEdit = vi.fn();
    const entry = makeEntry();
    render(<EntryCard entry={entry} onEdit={onEdit} />);
    fireEvent.click(screen.getByTestId('entry-card-menu-button-e1'));
    fireEvent.click(screen.getByTestId('entry-card-menu-edit-e1'));
    expect(onEdit).toHaveBeenCalledWith(entry);
  });

  it('onDelete 指定時は kebab → 削除メニューでコールバック', () => {
    const onDelete = vi.fn();
    const entry = makeEntry();
    render(<EntryCard entry={entry} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('entry-card-menu-button-e1'));
    fireEvent.click(screen.getByTestId('entry-card-menu-delete-e1'));
    expect(onDelete).toHaveBeenCalledWith(entry);
  });

  it('onEdit のみの場合、削除メニュー項目は表示しない', () => {
    render(<EntryCard entry={makeEntry()} onEdit={vi.fn()} />);
    fireEvent.click(screen.getByTestId('entry-card-menu-button-e1'));
    expect(screen.queryByTestId('entry-card-menu-delete-e1')).toBeNull();
  });

  it('タグを表示する', () => {
    render(
      <EntryCard
        entry={makeEntry({
          tags: [
            { id: 't1', name: 'うれしい', category: 'positive' as const },
            { id: 't2', name: '気づき', category: 'neutral' as const },
          ],
        })}
      />
    );
    expect(screen.getByText('うれしい')).toBeTruthy();
    expect(screen.getByText('気づき')).toBeTruthy();
  });
});
