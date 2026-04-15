import { describe, it, expect, vi } from 'vitest';
import { TagRepository, SYSTEM_DEFAULT_TAGS } from '@/features/journal/lib/tagRepository';

const ctx = { userId: 'user-1', tenantId: 'tenant-1' };

function makeInsertChain(returnValue: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(returnValue),
    }),
  };
}

function makeDeleteChain(returnValue: unknown[]) {
  return {
    where: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(returnValue),
    }),
  };
}

function makeSelectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function makeSelectByTagIdChain(result: unknown[]) {
  // delete の前に select で affected を取得する用
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

describe('SYSTEM_DEFAULT_TAGS', () => {
  it('8件のデフォルトタグが定義されている', () => {
    expect(SYSTEM_DEFAULT_TAGS).toHaveLength(8);
  });

  it('感情タグ5件と業務タグ3件の構成', () => {
    const emotions = SYSTEM_DEFAULT_TAGS.filter((t) => t.isEmotion);
    const tasks = SYSTEM_DEFAULT_TAGS.filter((t) => !t.isEmotion);
    expect(emotions).toHaveLength(5);
    expect(tasks).toHaveLength(3);
  });

  it('sort_order が 1〜8 で連番', () => {
    const sortOrders = SYSTEM_DEFAULT_TAGS.map((t) => t.sortOrder);
    expect(sortOrders).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('全てのタグ名がユニーク', () => {
    const names = SYSTEM_DEFAULT_TAGS.map((t) => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(8);
  });
});

describe('TagRepository.seedSystemDefaults', () => {
  it('8件のデフォルトタグを INSERT する', async () => {
    const insertChain = makeInsertChain(
      SYSTEM_DEFAULT_TAGS.map((t, i) => ({ id: `tag-${i}`, ...t, tenantId: 'tenant-1', isSystemDefault: true, createdBy: null, createdAt: new Date() }))
    );
    const mockTx = { insert: vi.fn().mockReturnValue(insertChain) };

    const repo = new TagRepository();
    const result = await repo.seedSystemDefaults(mockTx as never, 'tenant-1');

    expect(mockTx.insert).toHaveBeenCalledOnce();
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: 'tenant-1',
          isSystemDefault: true,
          createdBy: null,
        }),
      ])
    );
    const insertedValues = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertedValues).toHaveLength(8);
    expect(result).toHaveLength(8);
  });

  it('全シードタグで is_system_default=true・created_by=null', async () => {
    const insertChain = makeInsertChain([]);
    const mockTx = { insert: vi.fn().mockReturnValue(insertChain) };

    const repo = new TagRepository();
    await repo.seedSystemDefaults(mockTx as never, 'tenant-1');

    const insertedValues = (insertChain.values as ReturnType<typeof vi.fn>).mock.calls[0][0];
    for (const row of insertedValues) {
      expect(row.isSystemDefault).toBe(true);
      expect(row.createdBy).toBeNull();
    }
  });
});

describe('TagRepository.create', () => {
  it('ユーザー作成タグは isSystemDefault=false・createdBy=userId', async () => {
    const insertChain = makeInsertChain([
      { id: 'tag-new', tenantId: 'tenant-1', name: 'カスタム', isEmotion: false, isSystemDefault: false, sortOrder: 0, createdBy: 'user-1', createdAt: new Date() },
    ]);
    const mockTx = { insert: vi.fn().mockReturnValue(insertChain) };

    const repo = new TagRepository();
    const result = await repo.create(
      mockTx as never,
      { name: 'カスタム', isEmotion: false },
      ctx
    );

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        name: 'カスタム',
        isEmotion: false,
        isSystemDefault: false,
        createdBy: 'user-1',
      })
    );
    expect(result.id).toBe('tag-new');
  });
});

describe('TagRepository.delete', () => {
  it('削除成功時は deleted=true・affectedEntries を返す', async () => {
    const selectForAffected = makeSelectByTagIdChain([
      { entryId: 'e1' },
      { entryId: 'e2' },
      { entryId: 'e3' },
    ]);
    const deleteChain = makeDeleteChain([{ id: 'tag-1' }]);
    const mockTx = {
      select: vi.fn().mockReturnValue(selectForAffected),
      delete: vi.fn().mockReturnValue(deleteChain),
    };

    const repo = new TagRepository();
    const result = await repo.delete(mockTx as never, 'tag-1', ctx);

    expect(result.deleted).toBe(true);
    expect(result.affectedEntries).toBe(3);
  });

  it('削除対象がない場合（システムデフォルト等）は deleted=false', async () => {
    const selectForAffected = makeSelectByTagIdChain([]);
    const deleteChain = makeDeleteChain([]);
    const mockTx = {
      select: vi.fn().mockReturnValue(selectForAffected),
      delete: vi.fn().mockReturnValue(deleteChain),
    };

    const repo = new TagRepository();
    const result = await repo.delete(mockTx as never, 'system-tag', ctx);

    expect(result.deleted).toBe(false);
    expect(result.affectedEntries).toBe(0);
  });
});

describe('TagRepository.findAllByTenant', () => {
  it('テナント内のタグを sort_order 順で返す', async () => {
    const rows = [
      { id: 't1', name: 'うれしい', sortOrder: 1, isEmotion: true },
      { id: 't2', name: 'つかれた', sortOrder: 2, isEmotion: true },
    ];
    const mockTx = { select: vi.fn().mockReturnValue(makeSelectChain(rows)) };

    const repo = new TagRepository();
    const result = await repo.findAllByTenant(mockTx as never, ctx);

    expect(result).toHaveLength(2);
  });
});

describe('TagRepository.findValidTagIds', () => {
  it('空配列の場合は DB を叩かずに空を返す', async () => {
    const mockTx = { select: vi.fn() };

    const repo = new TagRepository();
    const result = await repo.findValidTagIds(mockTx as never, [], ctx);

    expect(result).toEqual([]);
    expect(mockTx.select).not.toHaveBeenCalled();
  });

  it('指定した tagIds のうちテナントに属するものだけを返す', async () => {
    const mockTx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: 'tag-a' },
            { id: 'tag-b' },
          ]),
        }),
      }),
    };

    const repo = new TagRepository();
    const result = await repo.findValidTagIds(
      mockTx as never,
      ['tag-a', 'tag-b', 'tag-c'],
      ctx
    );

    expect(result).toEqual(['tag-a', 'tag-b']);
  });
});
