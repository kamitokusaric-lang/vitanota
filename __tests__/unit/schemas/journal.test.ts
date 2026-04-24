import { describe, it, expect } from 'vitest';
import {
  createEntrySchema,
  updateEntrySchema,
  timelineQuerySchema,
} from '@/features/journal/schemas/journal';

const validUuid = '550e8400-e29b-41d4-a716-446655440000';
const validUuid2 = '550e8400-e29b-41d4-a716-446655440001';

describe('createEntrySchema', () => {
  describe('正常系', () => {
    it('最小構成のエントリを受け入れる', () => {
      const result = createEntrySchema.safeParse({
        content: 'a',
        tagIds: [],
        isPublic: true,
      });
      expect(result.success).toBe(true);
    });

    it('最大200文字の content を受け入れる', () => {
      const result = createEntrySchema.safeParse({
        content: 'x'.repeat(200),
        tagIds: [],
        isPublic: false,
      });
      expect(result.success).toBe(true);
    });

    it('最大10件の tagIds を受け入れる', () => {
      const result = createEntrySchema.safeParse({
        content: 'test',
        tagIds: Array.from({ length: 10 }, () => validUuid),
        isPublic: true,
      });
      expect(result.success).toBe(true);
    });

    it('前後の空白を trim する', () => {
      const result = createEntrySchema.safeParse({
        content: '  test  ',
        tagIds: [],
        isPublic: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toBe('test');
      }
    });
  });

  describe('異常系', () => {
    it('空文字列 content を拒否する', () => {
      const result = createEntrySchema.safeParse({
        content: '',
        tagIds: [],
        isPublic: true,
      });
      expect(result.success).toBe(false);
    });

    it('空白のみの content を拒否する（trim 後に空）', () => {
      const result = createEntrySchema.safeParse({
        content: '   ',
        tagIds: [],
        isPublic: true,
      });
      expect(result.success).toBe(false);
    });

    it('201文字の content を拒否する', () => {
      const result = createEntrySchema.safeParse({
        content: 'x'.repeat(201),
        tagIds: [],
        isPublic: true,
      });
      expect(result.success).toBe(false);
    });

    it('tagIds の上限がない（11件以上も受け入れる）', () => {
      const result = createEntrySchema.safeParse({
        content: 'test',
        tagIds: Array.from({ length: 11 }, () => validUuid),
        isPublic: true,
      });
      expect(result.success).toBe(true);
    });

    it('不正なUUIDの tagIds を拒否する', () => {
      const result = createEntrySchema.safeParse({
        content: 'test',
        tagIds: ['not-a-uuid'],
        isPublic: true,
      });
      expect(result.success).toBe(false);
    });

    it('isPublic が boolean でない場合を拒否する', () => {
      const result = createEntrySchema.safeParse({
        content: 'test',
        tagIds: [],
        isPublic: 'true',
      });
      expect(result.success).toBe(false);
    });

    it('必須フィールド欠落を拒否する', () => {
      const result = createEntrySchema.safeParse({
        content: 'test',
        tagIds: [],
      });
      expect(result.success).toBe(false);
    });

    it('content が数値の場合を拒否する', () => {
      const result = createEntrySchema.safeParse({
        content: 123,
        tagIds: [],
        isPublic: true,
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('updateEntrySchema', () => {
  it('全フィールド指定の更新を受け入れる', () => {
    const result = updateEntrySchema.safeParse({
      content: 'updated',
      tagIds: [validUuid],
      isPublic: false,
    });
    expect(result.success).toBe(true);
  });

  it('content のみの部分更新を受け入れる', () => {
    const result = updateEntrySchema.safeParse({
      content: 'updated',
    });
    expect(result.success).toBe(true);
  });

  it('空オブジェクト（何も更新しない）を受け入れる', () => {
    const result = updateEntrySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('update でも 201文字の content を拒否する', () => {
    const result = updateEntrySchema.safeParse({
      content: 'x'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('update でも tagIds の上限がない', () => {
    const result = updateEntrySchema.safeParse({
      tagIds: Array.from({ length: 11 }, () => validUuid2),
    });
    expect(result.success).toBe(true);
  });
});

describe('timelineQuerySchema', () => {
  it('デフォルト値を適用する', () => {
    const result = timelineQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.perPage).toBe(50);
    }
  });

  it('文字列を数値に coerce する', () => {
    const result = timelineQuerySchema.safeParse({
      page: '3',
      perPage: '15',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.perPage).toBe(15);
    }
  });

  it('page < 1 を拒否する', () => {
    const result = timelineQuerySchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it('perPage > 50 を拒否する', () => {
    const result = timelineQuerySchema.safeParse({ perPage: 51 });
    expect(result.success).toBe(false);
  });

  it('perPage の最大値 50 を受け入れる', () => {
    const result = timelineQuerySchema.safeParse({ perPage: 50 });
    expect(result.success).toBe(true);
  });

  it('非数値を拒否する', () => {
    const result = timelineQuerySchema.safeParse({ page: 'abc' });
    expect(result.success).toBe(false);
  });
});
