import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { MyJournalList } from '@/features/journal/components/MyJournalList';

const originalFetch = global.fetch;

function renderWithSWR(ui: React.ReactElement) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {ui}
    </SWRConfig>
  );
}

afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

describe('MyJournalList', () => {
  it('shows loading spinner when loading', () => {
    global.fetch = vi.fn(
      () => new Promise(() => {}),
    ) as unknown as typeof fetch;

    renderWithSWR(<MyJournalList />);
    expect(screen.getByTestId('my-journal-loading')).toBeInTheDocument();
  });

  it('shows error message on error', async () => {
    global.fetch = vi.fn(
      async () => new Response('error', { status: 500 }),
    ) as unknown as typeof fetch;

    renderWithSWR(<MyJournalList />);
    await waitFor(() => {
      expect(
        screen.getByText('マイ記録の取得に失敗しました'),
      ).toBeInTheDocument();
    });
  });

  it('shows empty state when no entries', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ entries: [], page: 1, perPage: 50 }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;

    renderWithSWR(<MyJournalList />);
    await waitFor(() => {
      expect(screen.getByTestId('my-journal-empty')).toBeInTheDocument();
    });
  });

  it('renders entries when data exists', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            entries: [
              {
                id: '1',
                content: 'テスト記録',
                createdAt: '2026-01-01T00:00:00Z',
                isPublic: true,
                tags: [],
              },
            ],
            page: 1,
            perPage: 50,
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;

    renderWithSWR(<MyJournalList />);
    await waitFor(() => {
      expect(screen.getByTestId('my-journal-list')).toBeInTheDocument();
    });
    expect(screen.getByText('テスト記録')).toBeInTheDocument();
  });
});
