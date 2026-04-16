import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import useSWR from 'swr';
import { MyJournalList } from '@/features/journal/components/MyJournalList';

vi.mock('swr', () => ({ default: vi.fn() }));

const mockUseSWR = useSWR as unknown as ReturnType<typeof vi.fn>;

describe('MyJournalList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner when loading', () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true });
    render(<MyJournalList />);
    expect(screen.getByTestId('my-journal-loading')).toBeInTheDocument();
  });

  it('shows error message on error', () => {
    mockUseSWR.mockReturnValue({ data: undefined, error: new Error('fail'), isLoading: false });
    render(<MyJournalList />);
    expect(screen.getByText('マイ記録の取得に失敗しました')).toBeInTheDocument();
  });

  it('shows empty state when no entries', () => {
    mockUseSWR.mockReturnValue({ data: { entries: [], page: 1, perPage: 20 }, error: undefined, isLoading: false });
    render(<MyJournalList />);
    expect(screen.getByTestId('my-journal-empty')).toBeInTheDocument();
  });

  it('renders entries when data exists', () => {
    mockUseSWR.mockReturnValue({
      data: {
        entries: [
          { id: '1', content: 'テスト記録', createdAt: '2026-01-01T00:00:00Z', isPublic: true, tags: [] },
        ],
        page: 1,
        perPage: 20,
      },
      error: undefined,
      isLoading: false,
    });
    render(<MyJournalList />);
    expect(screen.getByTestId('my-journal-list')).toBeInTheDocument();
    expect(screen.getByText('テスト記録')).toBeInTheDocument();
  });
});
