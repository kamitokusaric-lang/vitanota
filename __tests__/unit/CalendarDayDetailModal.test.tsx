import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CalendarDayDetailModal } from '@/features/calendar/components/CalendarDayDetailModal';
import type { TaskWithAssignees } from '@/features/tasks/hooks/useTasks';

function makeTask(overrides: Partial<TaskWithAssignees> = {}): TaskWithAssignees {
  return {
    id: 'task-1',
    tenantId: 't1',
    categoryId: 'c1',
    createdBy: 'u1',
    title: 'タスク',
    description: null,
    dueDate: null,
    status: 'todo',
    completedAt: null,
    sourceChatSnippet: null,
    createdAt: new Date('2026-05-01'),
    updatedAt: new Date('2026-05-01'),
    assignees: [],
    commentCount: 0,
    tags: [],
    ...overrides,
  } as TaskWithAssignees;
}

describe('CalendarDayDetailModal', () => {
  it('open=false: 何も描画しない', () => {
    render(
      <CalendarDayDetailModal
        open={false}
        date="2026-05-29"
        tasks={[]}
        onClose={vi.fn()}
        onEditTask={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId('calendar-day-detail-modal-content'),
    ).toBeNull();
  });

  it('open=true / tasks=0: 「この日のタスクはありません」 を表示', () => {
    render(
      <CalendarDayDetailModal
        open
        date="2026-05-29"
        tasks={[]}
        onClose={vi.fn()}
        onEditTask={vi.fn()}
      />,
    );
    expect(screen.getByTestId('calendar-day-detail-empty')).toBeInTheDocument();
  });

  it('複数タスクが TaskCard で並ぶ (status done は末尾、 dueDate 昇順)', () => {
    const tasks = [
      makeTask({
        id: 't-done',
        title: '完了済',
        status: 'done',
        completedAt: new Date('2026-05-29'),
      }),
      makeTask({ id: 't-late', title: '期限遅め', dueDate: '2026-06-15' as unknown as Date }),
      makeTask({ id: 't-early', title: '期限早め', dueDate: '2026-05-30' as unknown as Date }),
    ];
    render(
      <CalendarDayDetailModal
        open
        date="2026-05-29"
        tasks={tasks}
        onClose={vi.fn()}
        onEditTask={vi.fn()}
      />,
    );
    // 3 件全部表示
    expect(screen.getByText('期限早め')).toBeInTheDocument();
    expect(screen.getByText('期限遅め')).toBeInTheDocument();
    expect(screen.getByText('完了済')).toBeInTheDocument();
    // 並び順: t-early (未完了 dueDate 早) → t-late (未完了 dueDate 遅) → t-done (完了)
    const cards = screen.getAllByTestId(/^task-card-t-/);
    expect(cards[0].getAttribute('data-testid')).toContain('t-early');
    expect(cards[1].getAttribute('data-testid')).toContain('t-late');
    expect(cards[2].getAttribute('data-testid')).toContain('t-done');
  });

  it('TaskCard クリックで onEditTask が呼ばれる', () => {
    const onEditTask = vi.fn();
    const tasks = [makeTask({ id: 't-click', title: 'クリック対象' })];
    render(
      <CalendarDayDetailModal
        open
        date="2026-05-29"
        tasks={tasks}
        onClose={vi.fn()}
        onEditTask={onEditTask}
      />,
    );
    fireEvent.click(screen.getByTestId('task-card-edit-t-click'));
    expect(onEditTask).toHaveBeenCalledOnce();
    expect(onEditTask.mock.calls[0][0].id).toBe('t-click');
  });
});
