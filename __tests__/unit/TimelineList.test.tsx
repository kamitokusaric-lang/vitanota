import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { TimelineList } from '@/features/journal/components/TimelineList';

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

describe('TimelineList', () => {
  it('エントリを取得して一覧表示する', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          entries: [
            {
              id: 'e1',
              userId: 'u1',
              content: 'エントリ1',
              createdAt: new Date().toISOString(),
            },
            {
              id: 'e2',
              userId: 'u2',
              content: 'エントリ2',
              createdAt: new Date().toISOString(),
            },
          ],
          page: 1,
          perPage: 20,
        }),
        { status: 200 }
      )
    ) as unknown as typeof fetch;

    renderWithSWR(<TimelineList />);

    await waitFor(() => {
      expect(screen.getByTestId('timeline-list')).toBeTruthy();
    });
    expect(screen.getByTestId('entry-card-e1')).toBeTruthy();
    expect(screen.getByTestId('entry-card-e2')).toBeTruthy();
  });

  it('空の場合は empty state を表示する', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ entries: [], page: 1, perPage: 20 }),
        { status: 200 }
      )
    ) as unknown as typeof fetch;

    renderWithSWR(<TimelineList />);

    await waitFor(() => {
      expect(screen.getByTestId('timeline-list-empty')).toBeTruthy();
    });
  });

  it('エラー時は ErrorMessage を表示する', async () => {
    global.fetch = vi.fn(async () => new Response('error', { status: 500 })) as unknown as typeof fetch;

    renderWithSWR(<TimelineList />);

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(
        'タイムラインの取得に失敗しました'
      );
    });
  });

  it('1 ページ目を perPage パラメータ付きで取得する', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ entries: [], page: 1, perPage: 10 }),
        { status: 200 }
      )
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    renderWithSWR(<TimelineList perPage={10} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/public/journal/entries?page=1&perPage=10',
        { cache: 'no-store' }
      );
    });
  });
});
