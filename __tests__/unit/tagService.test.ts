import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockTagRepo, mockLogger } = vi.hoisted(() => ({
  mockTagRepo: {
    create: vi.fn(),
    delete: vi.fn(),
    findAllByTenant: vi.fn(),
  },
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/shared/lib/db', () => ({
  withTenantUser: vi.fn(
    async (_tenantId: string, _userId: string, fn: (tx: never) => unknown) =>
      fn({} as never)
  ),
}));

vi.mock('@/features/journal/lib/tagRepository', () => ({
  tagRepo: mockTagRepo,
}));

vi.mock('@/shared/lib/logger', () => ({
  logger: mockLogger,
}));

import { TagService } from '@/features/journal/lib/tagService';
import { ForbiddenError, TagNotFoundError } from '@/features/journal/lib/errors';

const teacherCtx = { userId: 'user-1', tenantId: 'tenant-1', roles: ['teacher'] };
const adminCtx = { userId: 'admin-1', tenantId: 'tenant-1', roles: ['school_admin'] };

describe('TagService.createTag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('teacher ロールでもタグを作成できる', async () => {
    const expected = { id: 'tag-new', name: 'カスタム', isEmotion: false };
    mockTagRepo.create.mockResolvedValue(expected);

    const service = new TagService();
    const result = await service.createTag(
      { name: 'カスタム', isEmotion: false },
      teacherCtx
    );

    expect(result).toEqual(expected);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'tag_created',
        tagId: 'tag-new',
        name: 'カスタム',
      })
    );
  });
});

describe('TagService.deleteTag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('school_admin は削除できる', async () => {
    mockTagRepo.delete.mockResolvedValue({ deleted: true, affectedEntries: 3 });

    const service = new TagService();
    const result = await service.deleteTag('tag-1', adminCtx);

    expect(result).toEqual({ affectedEntries: 3 });
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'tag_deleted',
        affectedEntries: 3,
      })
    );
  });

  it('teacher は削除できず ForbiddenError', async () => {
    const service = new TagService();
    await expect(service.deleteTag('tag-1', teacherCtx)).rejects.toThrow(
      ForbiddenError
    );

    expect(mockTagRepo.delete).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'tag_delete_forbidden',
        roles: ['teacher'],
      })
    );
  });

  it('system_admin ロールは school_admin ではないので拒否される', async () => {
    const sysAdminCtx = {
      userId: 'sys',
      tenantId: 'tenant-1',
      roles: ['system_admin'],
    };
    const service = new TagService();
    await expect(service.deleteTag('tag-1', sysAdminCtx)).rejects.toThrow(
      ForbiddenError
    );
  });

  it('削除対象が見つからない場合は TagNotFoundError', async () => {
    mockTagRepo.delete.mockResolvedValue({ deleted: false, affectedEntries: 0 });

    const service = new TagService();
    await expect(service.deleteTag('not-exist', adminCtx)).rejects.toThrow(
      TagNotFoundError
    );
  });
});

describe('TagService.listTenantTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('テナント内のタグ一覧を返す', async () => {
    const tags = [
      { id: 't1', name: 'うれしい' },
      { id: 't2', name: 'つかれた' },
    ];
    mockTagRepo.findAllByTenant.mockResolvedValue(tags);

    const service = new TagService();
    const result = await service.listTenantTags(teacherCtx);

    expect(result).toEqual(tags);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'tag_list_read',
        count: 2,
      })
    );
  });
});
