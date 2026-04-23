import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('50文字超の content は省略表示される', () => {
    const longContent = 'あ'.repeat(60);
    render(<EntryCard entry={makeEntry({ content: longContent })} />);
    const text = screen.getByTestId('entry-card-content-e1').textContent ?? '';
    expect(text).toHaveLength(51); // 50 + "…"
    expect(text.endsWith('…')).toBe(true);
  });

  it('50文字以下の content はそのまま表示される', () => {
    const content = 'あ'.repeat(50);
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

  it('showEditLink=true で編集リンクを表示', () => {
    render(<EntryCard entry={makeEntry()} showEditLink />);
    const link = screen.getByTestId('entry-card-edit-link-e1');
    expect(link.getAttribute('href')).toBe('/journal/e1/edit');
  });

  it('showEditLink=false（デフォルト）で編集リンクを表示しない', () => {
    render(<EntryCard entry={makeEntry()} />);
    expect(screen.queryByTestId('entry-card-edit-link-e1')).toBeNull();
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
