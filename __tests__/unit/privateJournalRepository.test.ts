import { describe, it, expect, vi } from 'vitest';
import { PrivateJournalRepository } from '@/features/journal/lib/privateJournalRepository';

const ctx = { userId: 'user-1', tenantId: 'tenant-1' };

function makeInsertChain(returnValue: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(returnValue),
    }),
  };
}

function makeInsertChainNoReturning(returnValue: unknown = undefined) {
  return {
    values: vi.fn().mockResolvedValue(returnValue),
  };
}

function makeUpdateChain(returnValue: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(returnValue),
      }),
    }),
  };
}

function makeDeleteChainReturning(returnValue: unknown[]) {
  return {
    where: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(returnValue),
    }),
  };
}

function makeDeleteChainNoReturning() {
  return {
    where: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSelectByIdChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function makeSelectListChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue(result),
          }),
        }),
      }),
    }),
  };
}

describe('PrivateJournalRepository.create', () => {
  it('エントリを INSERT し、tagIds を journal_entry_tags に一括 INSERT する', async () => {
    const entryReturn = [{ id: 'entry-1', tenantId: 'tenant-1', userId: 'user-1', content: 'test', isPublic: false, createdAt: new Date(), updatedAt: new Date() }];
    const entryInsert = makeInsertChain(entryReturn);
    const tagsInsert = makeInsertChainNoReturning();
    const mockTx = {
      insert: vi.fn()
        .mockReturnValueOnce(entryInsert)  // journal_entries
        .mockReturnValueOnce(tagsInsert),  // journal_entry_tags
    };

    const repo = new PrivateJournalRepository();
    const result = await repo.create(
      mockTx as never,
      { content: 'test', tagIds: ['tag-1', 'tag-2'], isPublic: false },
      ctx
    );

    expect(mockTx.insert).toHaveBeenCalledTimes(2);
    expect(entryInsert.values).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'user-1',
      content: 'test',
      isPublic: false,
    });
    expect(tagsInsert.values).toHaveBeenCalledWith([
      { tenantId: 'tenant-1', entryId: 'entry-1', tagId: 'tag-1' },
      { tenantId: 'tenant-1', entryId: 'entry-1', tagId: 'tag-2' },
    ]);
    expect(result.id).toBe('entry-1');
  });

  it('tagIds が空の場合は journal_entry_tags への INSERT をスキップする', async () => {
    const entryInsert = makeInsertChain([{ id: 'entry-2' }]);
    const mockTx = { insert: vi.fn().mockReturnValueOnce(entryInsert) };

    const repo = new PrivateJournalRepository();
    await repo.create(
      mockTx as never,
      { content: 'notag', tagIds: [], isPublic: true },
      ctx
    );

    expect(mockTx.insert).toHaveBeenCalledTimes(1);  // entry のみ
  });
});

describe('PrivateJournalRepository.update', () => {
  it('更新成功時にエントリを返却する', async () => {
    const entryReturn = [{ id: 'entry-1', content: 'updated', userId: 'user-1', tenantId: 'tenant-1', isPublic: true, createdAt: new Date(), updatedAt: new Date() }];
    const updateChain = makeUpdateChain(entryReturn);
    const mockTx = { update: vi.fn().mockReturnValue(updateChain) };

    const repo = new PrivateJournalRepository();
    const result = await repo.update(
      mockTx as never,
      'entry-1',
      { content: 'updated' },
      ctx
    );

    expect(result).not.toBeNull();
    expect(result?.content).toBe('updated');
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'updated' })
    );
  });

  it('該当行がない場合は null を返す', async () => {
    const updateChain = makeUpdateChain([]);
    const mockTx = { update: vi.fn().mockReturnValue(updateChain) };

    const repo = new PrivateJournalRepository();
    const result = await repo.update(mockTx as never, 'not-exist', { content: 'x' }, ctx);

    expect(result).toBeNull();
  });

  it('tagIds を渡すと既存の紐づきを DELETE して新規 INSERT する', async () => {
    const updateChain = makeUpdateChain([{ id: 'entry-1', content: 'x', isPublic: true, userId: 'user-1', tenantId: 'tenant-1', createdAt: new Date(), updatedAt: new Date() }]);
    const deleteChain = makeDeleteChainNoReturning();
    const tagsInsert = makeInsertChainNoReturning();
    const mockTx = {
      update: vi.fn().mockReturnValue(updateChain),
      delete: vi.fn().mockReturnValue(deleteChain),
      insert: vi.fn().mockReturnValue(tagsInsert),
    };

    const repo = new PrivateJournalRepository();
    await repo.update(
      mockTx as never,
      'entry-1',
      { tagIds: ['tag-new'] },
      ctx
    );

    expect(mockTx.delete).toHaveBeenCalledOnce();
    expect(mockTx.insert).toHaveBeenCalledOnce();
    expect(tagsInsert.values).toHaveBeenCalledWith([
      { tenantId: 'tenant-1', entryId: 'entry-1', tagId: 'tag-new' },
    ]);
  });

  it('tagIds が空配列の場合は DELETE のみ実行し INSERT は省略', async () => {
    const updateChain = makeUpdateChain([{ id: 'entry-1', content: 'x', isPublic: true, userId: 'user-1', tenantId: 'tenant-1', createdAt: new Date(), updatedAt: new Date() }]);
    const deleteChain = makeDeleteChainNoReturning();
    const mockTx = {
      update: vi.fn().mockReturnValue(updateChain),
      delete: vi.fn().mockReturnValue(deleteChain),
      insert: vi.fn(),
    };

    const repo = new PrivateJournalRepository();
    await repo.update(mockTx as never, 'entry-1', { tagIds: [] }, ctx);

    expect(mockTx.delete).toHaveBeenCalledOnce();
    expect(mockTx.insert).not.toHaveBeenCalled();
  });
});

describe('PrivateJournalRepository.delete', () => {
  it('削除成功時は true を返す', async () => {
    const deleteChain = makeDeleteChainReturning([{ id: 'entry-1' }]);
    const mockTx = { delete: vi.fn().mockReturnValue(deleteChain) };

    const repo = new PrivateJournalRepository();
    const result = await repo.delete(mockTx as never, 'entry-1', ctx);

    expect(result).toBe(true);
  });

  it('該当行がない場合は false を返す', async () => {
    const deleteChain = makeDeleteChainReturning([]);
    const mockTx = { delete: vi.fn().mockReturnValue(deleteChain) };

    const repo = new PrivateJournalRepository();
    const result = await repo.delete(mockTx as never, 'not-exist', ctx);

    expect(result).toBe(false);
  });
});

describe('PrivateJournalRepository.findById', () => {
  it('見つかった場合はタグ付きエントリを返す', async () => {
    const row = { id: 'entry-1', userId: 'user-1', tenantId: 'tenant-1', content: 'x', isPublic: false, createdAt: new Date(), updatedAt: new Date() };
    let callCount = 0;
    const mockTx = {
      select: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return makeSelectByIdChain([row]);
        // attachTags: タグ JOIN クエリ
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                { entryId: 'entry-1', tagId: 't1', tagName: 'うれしい', tagCategory: 'positive' },
              ]),
            }),
          }),
        };
      }),
    };

    const repo = new PrivateJournalRepository();
    const result = await repo.findById(mockTx as never, 'entry-1', ctx);

    expect(result).toMatchObject({ id: 'entry-1' });
    expect(result?.tags).toEqual([
      { id: 't1', name: 'うれしい', category: 'positive' },
    ]);
  });

  it('見つからない場合は null を返す', async () => {
    const mockTx = { select: vi.fn().mockReturnValue(makeSelectByIdChain([])) };

    const repo = new PrivateJournalRepository();
    const result = await repo.findById(mockTx as never, 'not-exist', ctx);

    expect(result).toBeNull();
  });
});

describe('PrivateJournalRepository.findMine', () => {
  it('ページネーション付きで自分のエントリを取得する（タグ付き）', async () => {
    const rows = [
      { id: 'e1', userId: 'user-1', tenantId: 'tenant-1', content: 'a', isPublic: false, createdAt: new Date(), updatedAt: new Date() },
      { id: 'e2', userId: 'user-1', tenantId: 'tenant-1', content: 'b', isPublic: true, createdAt: new Date(), updatedAt: new Date() },
    ];
    // findMine の select チェーン + attachTags の select チェーン
    let callCount = 0;
    const mockTx = {
      select: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // findMine 本体
          return makeSelectListChain(rows);
        }
        // attachTags: タグ JOIN クエリ（空配列を返す）
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        };
      }),
    };

    const repo = new PrivateJournalRepository();
    const result = await repo.findMine(mockTx as never, { limit: 20, offset: 0 }, ctx);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('e1');
    expect(result[0].tags).toEqual([]);
  });
});
