import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { CalendarWeekView } from '@/features/calendar/components/CalendarWeekView';

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

describe('CalendarWeekView', () => {
  it('loading 中は loading 表示', () => {
    global.fetch = vi.fn().mockImplementation(
      () => new Promise(() => undefined), // 永遠に pending
    );
    renderWithSwr(<CalendarWeekView onEditTask={vi.fn()} />);
    expect(screen.getByTestId('calendar-week-loading')).toBeInTheDocument();
  });

  it('取得成功で日付セルが 7 つ並ぶ (PC + mobile = 14 個)', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockJson({ tasks: [] }));
    renderWithSwr(<CalendarWeekView onEditTask={vi.fn()} />);
    await waitFor(() => {
      expect(screen.queryByTestId('calendar-week-loading')).toBeNull();
    });
    // testid を data-testid="calendar-day-{YYYY-MM-DD}" pattern で 7 つ + mobile 7 つ
    // (header / overflow は別 testid なので、 セル本体のみ filter)
    const pcCells = Array.from(
      document.querySelectorAll('[data-testid^="calendar-day-"]'),
    ).filter((el) => {
      const tid = el.getAttribute('data-testid') ?? '';
      return /^calendar-day-\d{4}-\d{2}-\d{2}$/.test(tid);
    });
    expect(pcCells.length).toBe(7);
    const mobileSections = Array.from(
      document.querySelectorAll('[data-testid^="calendar-mobile-day-"]'),
    ).filter((el) => {
      const tid = el.getAttribute('data-testid') ?? '';
      return /^calendar-mobile-day-\d{4}-\d{2}-\d{2}$/.test(tid);
    });
    expect(mobileSections.length).toBe(7);
  });

  it('取得したタスクの title が表示される (dueDate 振り分け OK)', async () => {
    // dueDate を「今週の月曜」 に動的に設定
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - diffToMonday);
    const mondayYmd = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

    global.fetch = vi.fn().mockResolvedValue(
      mockJson({
        tasks: [
          {
            id: 't-mon',
            tenantId: 't1',
            categoryId: 'c1',
            createdBy: 'u1',
            title: '今週月曜のタスク',
            description: null,
            dueDate: mondayYmd,
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
    renderWithSwr(<CalendarWeekView onEditTask={vi.fn()} />);
    await waitFor(() => {
      // PC セル + mobile セクションの 2 箇所に表示される
      const matches = screen.queryAllByText('今週月曜のタスク');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('「翌週」 ボタンで fetch が異なる URL で再呼び出しされる', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJson({ tasks: [] }));
    global.fetch = fetchMock;
    renderWithSwr(<CalendarWeekView onEditTask={vi.fn()} />);
    await waitFor(() => {
      expect(screen.queryByTestId('calendar-week-loading')).toBeNull();
    });
    const firstCallUrl = String(fetchMock.mock.calls[0][0]);
    expect(firstCallUrl).toContain('scope=mine');
    expect(firstCallUrl).toContain('mode=range');

    fireEvent.click(screen.getByTestId('calendar-week-next'));
    await waitFor(() => {
      const lastCallUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
      expect(lastCallUrl).not.toEqual(firstCallUrl);
    });
  });
});
