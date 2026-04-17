import { describe, it, expect, vi } from 'vitest';
import { PublicTimelineRepository } from '@/features/journal/lib/publicTimelineRepository';

// Drizzle fluent API のモックチェーンヘルパー
function makeSelectChain(result: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

// attachTags 用の select チェーン
function makeTagsSelectChain(tagRows: unknown[] = []) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(tagRows),
      }),
    }),
  };
}

describe('PublicTimelineRepository', () => {
  describe('findTimeline', () => {
    it('limit と offset を渡して結果を返す（タグ付き）', async () => {
      const mockRows = [
        { id: 'entry-1', tenantId: 't1', userId: 'u1', content: 'hello', createdAt: new Date(), updatedAt: new Date() },
      ];
      let callCount = 0;
      const mockTx = {
        select: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return makeSelectChain(mockRows);
          return makeTagsSelectChain([]);
        }),
      };

      const repo = new PublicTimelineRepository();
      const result = await repo.findTimeline(mockTx as never, { limit: 20, offset: 0 });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'entry-1' });
      expect(result[0].tags).toEqual([]);
    });

    it('結果が空の場合は空配列を返す', async () => {
      const chain = makeSelectChain([]);
      const mockTx = { select: vi.fn().mockReturnValue(chain) };

      const repo = new PublicTimelineRepository();
      const result = await repo.findTimeline(mockTx as never, { limit: 20, offset: 0 });

      expect(result).toEqual([]);
    });

    it('タグが付与されたエントリを正しく返す', async () => {
      const mockRows = [
        { id: 'e1', tenantId: 't1', userId: 'u1', content: 'test', createdAt: new Date(), updatedAt: new Date() },
      ];
      const tagRows = [
        { entryId: 'e1', tagId: 'tag1', tagName: '喜び', tagType: 'emotion', tagCategory: 'positive' },
      ];
      let callCount = 0;
      const mockTx = {
        select: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return makeSelectChain(mockRows);
          return makeTagsSelectChain(tagRows);
        }),
      };

      const repo = new PublicTimelineRepository();
      const result = await repo.findTimeline(mockTx as never, { limit: 20, offset: 0 });

      expect(result[0].tags).toHaveLength(1);
      expect(result[0].tags[0]).toMatchObject({ id: 'tag1', name: '喜び', type: 'emotion', category: 'positive' });
    });
  });

  describe('countTimeline', () => {
    it('件数を返す', async () => {
      const mockRows = [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }];
      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockResolvedValue(mockRows),
        }),
      };

      const repo = new PublicTimelineRepository();
      const count = await repo.countTimeline(mockTx as never);

      expect(count).toBe(3);
    });
  });
});
