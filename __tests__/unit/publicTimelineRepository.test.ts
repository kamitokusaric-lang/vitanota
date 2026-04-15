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

describe('PublicTimelineRepository', () => {
  describe('findTimeline', () => {
    it('limit と offset を渡して結果を返す', async () => {
      const mockRows = [
        { id: 'entry-1', tenantId: 't1', userId: 'u1', content: 'hello', createdAt: new Date(), updatedAt: new Date() },
      ];
      const chain = makeSelectChain(mockRows);
      const mockTx = { select: vi.fn().mockReturnValue(chain) };

      const repo = new PublicTimelineRepository();
      const result = await repo.findTimeline(mockTx as never, { limit: 20, offset: 0 });

      expect(mockTx.select).toHaveBeenCalledOnce();
      expect(chain.limit).toHaveBeenCalledWith(20);
      expect(chain.offset).toHaveBeenCalledWith(0);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'entry-1' });
    });

    it('結果が空の場合は空配列を返す', async () => {
      const chain = makeSelectChain([]);
      const mockTx = { select: vi.fn().mockReturnValue(chain) };

      const repo = new PublicTimelineRepository();
      const result = await repo.findTimeline(mockTx as never, { limit: 20, offset: 0 });

      expect(result).toEqual([]);
    });

    it('ページネーション offset を正しく渡す', async () => {
      const chain = makeSelectChain([]);
      const mockTx = { select: vi.fn().mockReturnValue(chain) };

      const repo = new PublicTimelineRepository();
      await repo.findTimeline(mockTx as never, { limit: 20, offset: 40 });

      expect(chain.limit).toHaveBeenCalledWith(20);
      expect(chain.offset).toHaveBeenCalledWith(40);
    });

    it('返却型は PublicJournalEntry（is_public 列を含まない想定）', async () => {
      // VIEW 経由で返るため、is_public は本来含まれない
      // 型アサーションが機能していることを確認
      const mockRows = [
        { id: 'e1', tenantId: 't1', userId: 'u1', content: 'test', createdAt: new Date(), updatedAt: new Date() },
      ];
      const chain = makeSelectChain(mockRows);
      const mockTx = { select: vi.fn().mockReturnValue(chain) };

      const repo = new PublicTimelineRepository();
      const result = await repo.findTimeline(mockTx as never, { limit: 20, offset: 0 });

      // TypeScript の型レベルで isPublic プロパティはアクセスできない（PublicJournalEntry = Omit<JournalEntry, 'isPublic'>）
      expect(result[0]).not.toHaveProperty('isPublic');
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
