import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalendarDayCell } from '@/features/calendar/components/CalendarDayCell';
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

describe('CalendarDayCell', () => {
  it('空のセル: タスク 0 件でもクラッシュせず日付ラベルだけ表示する', () => {
    render(<CalendarDayCell date="2026-05-29" tasks={[]} />);
    expect(screen.getByTestId('calendar-day-2026-05-29')).toBeInTheDocument();
    expect(screen.getByText('5/29 (金)')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-day-overflow-2026-05-29')).toBeNull();
  });

  it('4 件以下: 全件表示、 オーバーフロー行は出ない', () => {
    const tasks = [1, 2, 3, 4].map((i) =>
      makeTask({ id: `t${i}`, title: `タスク ${i}` }),
    );
    render(<CalendarDayCell date="2026-05-29" tasks={tasks} />);
    expect(screen.getByText('タスク 1')).toBeInTheDocument();
    expect(screen.getByText('タスク 4')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-day-overflow-2026-05-29')).toBeNull();
  });

  it('5 件以上: 4 件表示 + 「+N 件」 行', () => {
    const tasks = [1, 2, 3, 4, 5, 6, 7].map((i) =>
      makeTask({ id: `t${i}`, title: `タスク ${i}` }),
    );
    render(<CalendarDayCell date="2026-05-29" tasks={tasks} />);
    expect(screen.getByText('タスク 1')).toBeInTheDocument();
    expect(screen.getByText('タスク 4')).toBeInTheDocument();
    // 5 件目以降は表示されない
    expect(screen.queryByText('タスク 5')).toBeNull();
    expect(screen.queryByText('タスク 7')).toBeNull();
    // overflow 行に「+3 件」
    const overflow = screen.getByTestId('calendar-day-overflow-2026-05-29');
    expect(overflow.textContent).toContain('+3');
    expect(overflow.textContent).toContain('件');
  });

  it('isToday=true でセル背景が indigo 系になる', () => {
    render(<CalendarDayCell date="2026-05-29" tasks={[]} isToday />);
    const cell = screen.getByTestId('calendar-day-2026-05-29');
    expect(cell.className).toMatch(/bg-indigo-50/);
  });

  it('done タスクは line-through / opacity-60', () => {
    const tasks = [makeTask({ id: 't1', title: '完了タスク', status: 'done' })];
    render(<CalendarDayCell date="2026-05-29" tasks={tasks} />);
    const row = screen.getByTestId('calendar-task-row-t1');
    expect(row.className).toMatch(/line-through/);
    expect(row.className).toMatch(/opacity-60/);
  });

  it('onMoveTask 指定時 + 未完了タスク: タスク行が draggable=true', () => {
    const tasks = [makeTask({ id: 't-todo', title: '未完了', status: 'todo' })];
    render(
      <CalendarDayCell
        date="2026-05-29"
        tasks={tasks}
        onMoveTask={vi.fn()}
      />,
    );
    const row = screen.getByTestId('calendar-task-row-t-todo');
    expect(row.getAttribute('draggable')).toBe('true');
  });

  it('done タスクは draggable=false (移動禁止、 chimo 2026-05-29 指示)', () => {
    const tasks = [makeTask({ id: 't-done', title: '完了済', status: 'done' })];
    render(
      <CalendarDayCell
        date="2026-05-29"
        tasks={tasks}
        onMoveTask={vi.fn()}
      />,
    );
    const row = screen.getByTestId('calendar-task-row-t-done');
    expect(row.getAttribute('draggable')).toBe('false');
  });

  it('maxVisible=Infinity で全件表示 + 「+N 件」 出ない', () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeTask({ id: `t${i}`, title: `タスク ${i}` }),
    );
    render(
      <CalendarDayCell date="2026-05-29" tasks={tasks} maxVisible={Infinity} />,
    );
    expect(screen.getByText('タスク 0')).toBeInTheDocument();
    expect(screen.getByText('タスク 9')).toBeInTheDocument();
    expect(
      screen.queryByTestId('calendar-day-overflow-2026-05-29'),
    ).toBeNull();
  });
});
