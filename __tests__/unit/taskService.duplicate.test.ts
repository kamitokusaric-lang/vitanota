import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockTaskRepo, mockLogger } = vi.hoisted(() => ({
  mockTaskRepo: {
    findById: vi.fn(),
    create: vi.fn(),
  },
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/shared/lib/db', () => ({
  withTenantUser: vi.fn(
    async (_tenantId: string, _userId: string, _role: string, fn: (tx: never) => unknown) =>
      fn({} as never),
  ),
}));

vi.mock('@/features/tasks/lib/taskRepository', () => ({
  taskRepo: mockTaskRepo,
}));

vi.mock('@/features/tasks/lib/taskCategoryRepository', () => ({
  taskCategoryRepo: { findAllByTenant: vi.fn() },
}));

vi.mock('@/shared/lib/logger', () => ({
  logger: mockLogger,
}));

import { TaskService } from '@/features/tasks/lib/taskService';
import { TaskNotFoundError } from '@/features/tasks/lib/errors';

const ctx = { userId: 'user-self', tenantId: 'tenant-1', roles: ['teacher'] };

const sourceTask = {
  id: 'task-source',
  tenantId: 'tenant-1',
  categoryId: 'cat-1',
  ownerUserId: 'user-other',
  createdBy: 'user-other',
  title: '元タスク',
  description: '元の説明',
  dueDate: new Date('2026-05-10'),
  status: 'in_progress' as const,
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('TaskService.duplicateTask', () => {
  let service: TaskService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TaskService();
  });

  it('元タスクから複製: createdBy = 操作者、status は repo デフォルト (todo)', async () => {
    mockTaskRepo.findById.mockResolvedValue(sourceTask);
    mockTaskRepo.create.mockImplementation(async (_tx, params) => ({
      ...sourceTask,
      id: 'task-new',
      ...params,
      status: 'todo',
      completedAt: null,
    }));

    const result = await service.duplicateTask(
      'task-source',
      { ownerUserId: 'user-target' },
      ctx,
    );

    expect(mockTaskRepo.create).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        categoryId: 'cat-1',
        ownerUserId: 'user-target',
        createdBy: 'user-self',
        title: '元タスク',
        description: '元の説明',
        dueDate: sourceTask.dueDate,
      }),
      ctx,
    );
    expect(result.status).toBe('todo');
    expect(result.completedAt).toBeNull();
  });

  it('source が見つからないと TaskNotFoundError を投げる', async () => {
    mockTaskRepo.findById.mockResolvedValue(null);

    await expect(
      service.duplicateTask('task-missing', { ownerUserId: 'user-target' }, ctx),
    ).rejects.toThrow(TaskNotFoundError);
    expect(mockTaskRepo.create).not.toHaveBeenCalled();
  });

  it('params で title / description / dueDate / categoryId を上書き可能', async () => {
    mockTaskRepo.findById.mockResolvedValue(sourceTask);
    mockTaskRepo.create.mockResolvedValue({ ...sourceTask, id: 'task-new' });

    await service.duplicateTask(
      'task-source',
      {
        ownerUserId: 'user-target',
        title: '新タイトル',
        description: '新説明',
        dueDate: '2026-06-01',
        categoryId: 'cat-2',
      },
      ctx,
    );

    expect(mockTaskRepo.create).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        categoryId: 'cat-2',
        ownerUserId: 'user-target',
        createdBy: 'user-self',
        title: '新タイトル',
        description: '新説明',
        dueDate: new Date('2026-06-01T00:00:00Z'),
      }),
      ctx,
    );
  });

  it('description = null を渡すと undefined として扱う (説明なし)', async () => {
    mockTaskRepo.findById.mockResolvedValue(sourceTask);
    mockTaskRepo.create.mockResolvedValue({ ...sourceTask, id: 'task-new' });

    await service.duplicateTask(
      'task-source',
      { ownerUserId: 'user-target', description: null },
      ctx,
    );

    expect(mockTaskRepo.create).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        description: undefined,
      }),
      ctx,
    );
  });
});
