import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted でトップレベル変数を vi.mock より前に初期化する
const { mockPrivateRepo, mockTagRepo, mockLogger } = vi.hoisted(() => ({
  mockPrivateRepo: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(),
    findMine: vi.fn(),
  },
  mockTagRepo: {
    findValidTagIds: vi.fn(),
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
      fn({} as never)
  ),
}));

vi.mock('@/features/journal/lib/privateJournalRepository', () => ({
  privateJournalRepo: mockPrivateRepo,
}));

vi.mock('@/features/journal/lib/tagRepository', () => ({
  tagRepo: mockTagRepo,
}));

vi.mock('@/shared/lib/logger', () => ({
  logger: mockLogger,
}));

import { JournalEntryService } from '@/features/journal/lib/journalEntryService';
import {
  JournalNotFoundError,
  InvalidTagReferenceError,
} from '@/features/journal/lib/errors';

const ctx = { userId: 'user-1', tenantId: 'tenant-1', roles: ['teacher'] };

describe('JournalEntryService.createEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('正常系: Repository を呼び出してエントリを返し、イベントログを出力する', async () => {
    const expectedEntry = {
      id: 'e1',
      content: 'test',
      isPublic: false,
      userId: 'user-1',
      tenantId: 'tenant-1',
    };
    mockPrivateRepo.create.mockResolvedValue(expectedEntry);
    mockTagRepo.findValidTagIds.mockResolvedValue(['tag-1']);

    const service = new JournalEntryService();
    const result = await service.createEntry(
      { content: 'test', tagIds: ['tag-1'], isPublic: false },
      ctx
    );

    expect(result).toEqual(expectedEntry);
    expect(mockPrivateRepo.create).toHaveBeenCalledOnce();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'journal_entry_created',
        entryId: 'e1',
        isPublic: false,
        tagCount: 1,
      })
    );
  });

  it('タグなしの場合はタグ検証をスキップする', async () => {
    mockPrivateRepo.create.mockResolvedValue({ id: 'e2', isPublic: true });

    const service = new JournalEntryService();
    await service.createEntry(
      { content: 'notag', tagIds: [], isPublic: true },
      ctx
    );

    expect(mockTagRepo.findValidTagIds).not.toHaveBeenCalled();
  });

  it('無効なタグ ID が含まれる場合は InvalidTagReferenceError を投げる', async () => {
    mockTagRepo.findValidTagIds.mockResolvedValue(['tag-valid']);

    const service = new JournalEntryService();
    await expect(
      service.createEntry(
        { content: 'test', tagIds: ['tag-valid', 'tag-invalid'], isPublic: false },
        ctx
      )
    ).rejects.toThrow(InvalidTagReferenceError);

    expect(mockPrivateRepo.create).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'journal_entry_create_invalid_tags',
        invalidTagIds: ['tag-invalid'],
      }),
      expect.any(String)
    );
  });
});

describe('JournalEntryService.updateEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('正常系: Repository を呼び出して更新結果を返す', async () => {
    const updated = { id: 'e1', content: 'updated', isPublic: false };
    mockPrivateRepo.update.mockResolvedValue(updated);

    const service = new JournalEntryService();
    const result = await service.updateEntry('e1', { content: 'updated' }, ctx);

    expect(result).toEqual(updated);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'journal_entry_updated', entryId: 'e1' })
    );
  });

  it('Repository が null を返す場合は JournalNotFoundError', async () => {
    mockPrivateRepo.update.mockResolvedValue(null);

    const service = new JournalEntryService();
    await expect(
      service.updateEntry('e-other', { content: 'x' }, ctx)
    ).rejects.toThrow(JournalNotFoundError);
  });

  it('タグ更新時も不正タグ ID を検出する', async () => {
    mockTagRepo.findValidTagIds.mockResolvedValue([]);

    const service = new JournalEntryService();
    await expect(
      service.updateEntry('e1', { tagIds: ['bad-tag'] }, ctx)
    ).rejects.toThrow(InvalidTagReferenceError);

    expect(mockPrivateRepo.update).not.toHaveBeenCalled();
  });
});

describe('JournalEntryService.deleteEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('正常系: 削除成功', async () => {
    mockPrivateRepo.delete.mockResolvedValue(true);

    const service = new JournalEntryService();
    await service.deleteEntry('e1', ctx);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'journal_entry_deleted', entryId: 'e1' })
    );
  });

  it('削除失敗時は JournalNotFoundError', async () => {
    mockPrivateRepo.delete.mockResolvedValue(false);

    const service = new JournalEntryService();
    await expect(service.deleteEntry('e-other', ctx)).rejects.toThrow(
      JournalNotFoundError
    );
  });
});

describe('JournalEntryService.getEntryById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('正常系: エントリを返し read ログを出力する', async () => {
    const entry = {
      id: 'e1',
      content: 'x',
      isPublic: false,
      userId: 'user-1',
      tenantId: 'tenant-1',
    };
    mockPrivateRepo.findById.mockResolvedValue(entry);

    const service = new JournalEntryService();
    const result = await service.getEntryById('e1', ctx);

    expect(result).toEqual(entry);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'journal_entry_read',
        accessType: 'owner',
      })
    );
  });

  it('見つからない場合は JournalNotFoundError', async () => {
    mockPrivateRepo.findById.mockResolvedValue(null);

    const service = new JournalEntryService();
    await expect(service.getEntryById('not-exist', ctx)).rejects.toThrow(
      JournalNotFoundError
    );
  });
});

describe('JournalEntryService.listMine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('自分のエントリ一覧を取得し list_read ログを出力する', async () => {
    const entries = [{ id: 'e1' }, { id: 'e2' }];
    mockPrivateRepo.findMine.mockResolvedValue(entries);

    const service = new JournalEntryService();
    const result = await service.listMine(ctx, { limit: 20, offset: 0 });

    expect(result).toEqual(entries);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'journal_entry_list_read',
        endpoint: 'mine',
        count: 2,
      })
    );
  });
});
