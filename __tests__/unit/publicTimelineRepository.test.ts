import { describe, it, expect, vi } from 'vitest';
import { PublicTimelineRepository } from '@/features/journal/lib/publicTimelineRepository';

// Drizzle fluent API のモックチェーンヘルパー
// users / user_tenant_profiles を 2 回 leftJoin するためチェーン内で返し続ける
function makeSelectChain(result: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

// attachTags 用の select チェーン (emotion / knowledge tag JOIN)
function makeTagsSelectChain(tagRows: unknown[] = []) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(tagRows),
      }),
    }),
  };
}

// attachReactions: count rows (where + groupBy)
function makeReactionCountChain(rows: unknown[] = []) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        groupBy: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

// attachReactions: my rows (where のみ)
function makeReactionMyChain(rows: unknown[] = []) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

// attachComments: from → leftJoin×2 → where → orderBy (resolve)
function makeCommentsSelectChain(rows: unknown[] = []) {
  return {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
}

describe('PublicTimelineRepository', () => {
  describe('findTimeline', () => {
    it('limit と offset を渡して結果を返す（タグ付き）', async () => {
      const mockRows = [
        { id: 'entry-1', tenantId: 't1', userId: 'u1', content: 'hello', createdAt: new Date(), updatedAt: new Date() },
      ];
      // select 呼出順: 1=本体 findTimeline / 2=emotion / 3=knowledge / 4=count / 5=my / 6=comments
      const mockTx = {
        select: vi.fn()
          .mockReturnValueOnce(makeSelectChain(mockRows))
          .mockReturnValueOnce(makeTagsSelectChain([]))  // emotion
          .mockReturnValueOnce(makeTagsSelectChain([]))  // knowledge
          .mockReturnValueOnce(makeReactionCountChain([]))
          .mockReturnValueOnce(makeReactionMyChain([]))
          .mockReturnValueOnce(makeCommentsSelectChain([])),
      };

      const repo = new PublicTimelineRepository();
      const result = await repo.findTimeline(mockTx as never, { limit: 20, offset: 0 }, { tenantId: 't1', userId: 'u1' });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'entry-1' });
      expect(result[0].tags).toEqual([]);
      expect(result[0].knowledgeTags).toEqual([]);
      expect(result[0].reactions.knowledge).toEqual({ count: 0, mine: false });
      expect(result[0].reactions.appreciation).toEqual({ count: 0, mine: false });
      expect(result[0].reactions.endorsement).toEqual({ count: 0, mine: false });
    });

    it('結果が空の場合は空配列を返す', async () => {
      // entries が空のときは attachTags / attachReactions に進まないので select は 1 回だけ
      const chain = makeSelectChain([]);
      const mockTx = { select: vi.fn().mockReturnValue(chain) };

      const repo = new PublicTimelineRepository();
      const result = await repo.findTimeline(mockTx as never, { limit: 20, offset: 0 }, { tenantId: 't1', userId: 'u1' });

      expect(result).toEqual([]);
    });

    it('タグが付与されたエントリを正しく返す', async () => {
      const mockRows = [
        { id: 'e1', tenantId: 't1', userId: 'u1', content: 'test', createdAt: new Date(), updatedAt: new Date() },
      ];
      const tagRows = [
        { entryId: 'e1', tagId: 'tag1', tagName: '喜び', tagCategory: 'positive' },
      ];
      // select 呼出順: 1=本体 / 2=emotion (1件) / 3=knowledge (空) / 4=count (空) / 5=my (空) / 6=comments (空)
      const mockTx = {
        select: vi.fn()
          .mockReturnValueOnce(makeSelectChain(mockRows))
          .mockReturnValueOnce(makeTagsSelectChain(tagRows))
          .mockReturnValueOnce(makeTagsSelectChain([]))
          .mockReturnValueOnce(makeReactionCountChain([]))
          .mockReturnValueOnce(makeReactionMyChain([]))
          .mockReturnValueOnce(makeCommentsSelectChain([])),
      };

      const repo = new PublicTimelineRepository();
      const result = await repo.findTimeline(mockTx as never, { limit: 20, offset: 0 }, { tenantId: 't1', userId: 'u1' });

      expect(result[0].tags).toHaveLength(1);
      expect(result[0].tags[0]).toMatchObject({ id: 'tag1', name: '喜び', category: 'positive' });
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
