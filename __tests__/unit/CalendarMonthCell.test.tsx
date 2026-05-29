import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CalendarMonthCell } from '@/features/calendar/components/CalendarMonthCell';
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

describe('CalendarMonthCell', () => {
  it('空のセル: タスク 0 件でも日付バッジだけ表示する', () => {
    render(
      <CalendarMonthCell
        date="2026-05-29"
        tasks={[]}
        onSelectDate={vi.fn()}
        onEditTask={vi.fn()}
      />,
    );
    expect(screen.getByTestId('calendar-month-cell-2026-05-29')).toBeInTheDocument();
    // 日付バッジは「29」のみ
    expect(screen.getByText('29')).toBeInTheDocument();
    expect(
      screen.queryByTestId('calendar-month-cell-overflow-2026-05-29'),
    ).toBeNull();
  });

  it('3 件以下: 全部 compact 行で表示', () => {
    const tasks = [1, 2, 3].map((i) =>
      makeTask({ id: `t${i}`, title: `タスク ${i}` }),
    );
    render(
      <CalendarMonthCell
        date="2026-05-29"
        tasks={tasks}
        onSelectDate={vi.fn()}
        onEditTask={vi.fn()}
      />,
    );
    expect(screen.getByText('タスク 1')).toBeInTheDocument();
    expect(screen.getByText('タスク 2')).toBeInTheDocument();
    expect(screen.getByText('タスク 3')).toBeInTheDocument();
    expect(
      screen.queryByTestId('calendar-month-cell-overflow-2026-05-29'),
    ).toBeNull();
  });

  it('4 件以上: 3 件表示 + 「+N 件」 行', () => {
    const tasks = [1, 2, 3, 4, 5].map((i) =>
      makeTask({ id: `t${i}`, title: `タスク ${i}` }),
    );
    render(
      <CalendarMonthCell
        date="2026-05-29"
        tasks={tasks}
        onSelectDate={vi.fn()}
        onEditTask={vi.fn()}
      />,
    );
    expect(screen.getByText('タスク 1')).toBeInTheDocument();
    expect(screen.getByText('タスク 3')).toBeInTheDocument();
    expect(screen.queryByText('タスク 4')).toBeNull();
    expect(screen.queryByText('タスク 5')).toBeNull();
    const overflow = screen.getByTestId('calendar-month-cell-overflow-2026-05-29');
    expect(overflow.textContent).toContain('+2');
  });

  it('タスク行クリックで onEditTask が当該タスクで呼ばれる', () => {
    const onEditTask = vi.fn();
    const tasks = [makeTask({ id: 't-click', title: 'クリック対象' })];
    render(
      <CalendarMonthCell
        date="2026-05-29"
        tasks={tasks}
        onSelectDate={vi.fn()}
        onEditTask={onEditTask}
      />,
    );
    fireEvent.click(screen.getByTestId('calendar-month-task-row-t-click'));
    expect(onEditTask).toHaveBeenCalledOnce();
    expect(onEditTask.mock.calls[0][0].id).toBe('t-click');
  });

  it('「+N 件」 クリックで onSelectDate が呼ばれる (詳細モーダル動線)', () => {
    const onSelectDate = vi.fn();
    const tasks = [1, 2, 3, 4].map((i) =>
      makeTask({ id: `t${i}`, title: `タスク ${i}` }),
    );
    render(
      <CalendarMonthCell
        date="2026-05-29"
        tasks={tasks}
        onSelectDate={onSelectDate}
        onEditTask={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('calendar-month-cell-overflow-2026-05-29'));
    expect(onSelectDate).toHaveBeenCalledWith('2026-05-29');
  });

  it('outOfMonth=true: 当月外 (淡色化、 セル背景が slate-50)', () => {
    render(
      <CalendarMonthCell
        date="2026-04-28"
        tasks={[]}
        outOfMonth
        onSelectDate={vi.fn()}
        onEditTask={vi.fn()}
      />,
    );
    const cell = screen.getByTestId('calendar-month-cell-2026-04-28');
    expect(cell.className).toMatch(/bg-slate-50/);
  });
});
