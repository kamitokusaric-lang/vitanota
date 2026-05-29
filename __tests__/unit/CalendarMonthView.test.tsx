import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { CalendarMonthView } from '@/features/calendar/components/CalendarMonthView';

vi.mock('next/router', () => ({
  useRouter: () => ({
    query: {},
    pathname: '/dashboard',
    push: vi.fn(),
  }),
}));

const originalFetch = global.fetch;

function mockJson(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderWithSwr(ui: React.ReactNode) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {ui}
    </SWRConfig>,
  );
}

afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

describe('CalendarMonthView', () => {
  it('loading 中は loading 表示', () => {
    global.fetch = vi
      .fn()
      .mockImplementation(() => new Promise(() => undefined));
    renderWithSwr(<CalendarMonthView onEditTask={vi.fn()} />);
    expect(screen.getByTestId('calendar-month-loading')).toBeInTheDocument();
  });

  it('取得成功で 35 or 42 個の日付セル (PC + mobile)', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockJson({ tasks: [] }));
    renderWithSwr(<CalendarMonthView onEditTask={vi.fn()} />);
    await waitFor(() => {
      expect(screen.queryByTestId('calendar-month-loading')).toBeNull();
    });
    // PC: data-testid="calendar-month-cell-{YYYY-MM-DD}" pattern
    const pcCells = document.querySelectorAll(
      '[data-testid^="calendar-month-cell-"]',
    );
    // PC セル本体 + 各セル内の "calendar-month-cell-header-..." と "calendar-month-cell-overflow-..." を含む
    // 本体だけ filter: data-testid が 'calendar-month-cell-YYYY-MM-DD' で日付 10 char
    const cellBodies = Array.from(pcCells).filter((el) => {
      const tid = el.getAttribute('data-testid') ?? '';
      return /^calendar-month-cell-\d{4}-\d{2}-\d{2}$/.test(tid);
    });
    expect([35, 42]).toContain(cellBodies.length);
  });

  it('「翌月」 ボタンで fetch が異なる URL で再呼び出しされる', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJson({ tasks: [] }));
    global.fetch = fetchMock;
    renderWithSwr(<CalendarMonthView onEditTask={vi.fn()} />);
    await waitFor(() => {
      expect(screen.queryByTestId('calendar-month-loading')).toBeNull();
    });
    const firstCallUrl = String(fetchMock.mock.calls[0][0]);
    fireEvent.click(screen.getByTestId('calendar-month-next'));
    await waitFor(() => {
      const lastCallUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
      expect(lastCallUrl).not.toEqual(firstCallUrl);
    });
  });

  it('日付ヘッダクリックで詳細モーダルが open する', async () => {
    // dueDate を「今月の 15 日」 (確実に grid 内に存在する日) に
    const today = new Date();
    const day15 = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-15`;
    global.fetch = vi.fn().mockResolvedValue(
      mockJson({
        tasks: [
          {
            id: 't1',
            tenantId: 't1',
            categoryId: 'c1',
            createdBy: 'u1',
            title: '15 日のタスク',
            description: null,
            dueDate: day15,
            status: 'todo',
            completedAt: null,
            sourceChatSnippet: null,
            createdAt: '2026-05-01T00:00:00Z',
            updatedAt: '2026-05-01T00:00:00Z',
            assignees: [],
            commentCount: 0,
            tags: [],
          },
        ],
      }),
    );
    renderWithSwr(<CalendarMonthView onEditTask={vi.fn()} />);
    await waitFor(() => {
      expect(screen.queryByTestId('calendar-month-loading')).toBeNull();
    });
    // 15 日のヘッダをクリック → 詳細モーダル open
    fireEvent.click(screen.getByTestId(`calendar-month-cell-header-${day15}`));
    await waitFor(() => {
      expect(
        screen.getByTestId('calendar-day-detail-modal-content'),
      ).toBeInTheDocument();
    });
  });
});
