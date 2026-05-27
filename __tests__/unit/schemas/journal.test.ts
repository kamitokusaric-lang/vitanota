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
    it('最小構成の diary を受け入れる (mood 必須)', () => {
      const result = createEntrySchema.safeParse({
        kind: 'diary',
        content: 'a',
        tagIds: [],
        mood: 'neutral',
        isPublic: true,
      });
      expect(result.success).toBe(true);
    });

    it('最大 1000 文字の diary content を受け入れる', () => {
      const result = createEntrySchema.safeParse({
        kind: 'diary',
        content: 'x'.repeat(1000),
        tagIds: [],
        mood: 'neutral',
        isPublic: false,
      });
      expect(result.success).toBe(true);
    });

    it('最大 1000 文字の knowledge content を受け入れる', () => {
      const result = createEntrySchema.safeParse({
        kind: 'knowledge',
        content: 'x'.repeat(1000),
        tagIds: [],
        isPublic: true,
      });
      expect(result.success).toBe(true);
    });

    it('最大 200 文字の tweet content を受け入れる', () => {
      const result = createEntrySchema.safeParse({
        kind: 'tweet',
        content: 'x'.repeat(200),
        tagIds: [],
        isPublic: true,
      });
      expect(result.success).toBe(true);
    });

    it('knowledge は tagIds 11 件以上も受け入れる (上限なし)', () => {
      const result = createEntrySchema.safeParse({
        kind: 'knowledge',
        content: 'test',
        tagIds: Array.from({ length: 11 }, () => validUuid),
        isPublic: true,
      });
      expect(result.success).toBe(true);
    });

    it('tweet は tagIds (emotion_tags) を受け入れる', () => {
      const result = createEntrySchema.safeParse({
        kind: 'tweet',
        content: 'test',
        tagIds: [validUuid, validUuid2],
        isPublic: true,
      });
      expect(result.success).toBe(true);
    });

    it('前後の空白を trim する (diary)', () => {
      const result = createEntrySchema.safeParse({
        kind: 'diary',
        content: '  test  ',
        tagIds: [],
        mood: 'neutral',
        isPublic: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toBe('test');
      }
    });

    it('空白のみの content は trim されて空文字として受け入れられる (knowledge)', () => {
      const result = createEntrySchema.safeParse({
        kind: 'knowledge',
        content: '   ',
        tagIds: [],
        isPublic: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toBe('');
      }
    });
  });

  describe('異常系', () => {
    it('diary で mood なしを受理する (2026-05-27: kind 分岐撤廃、 mood は全 kind 任意)', () => {
      const result = createEntrySchema.safeParse({
        kind: 'diary',
        content: 'test',
        tagIds: [],
        isPublic: true,
        // mood なし
      });
      expect(result.success).toBe(true);
    });

    it('knowledge で mood ありを受理する (2026-05-27: 任意化、 旧禁止ルール撤廃)', () => {
      const result = createEntrySchema.safeParse({
        kind: 'knowledge',
        content: 'test',
        tagIds: [],
        mood: 'neutral',
        isPublic: true,
      });
      expect(result.success).toBe(true);
    });

    it('tweet で mood ありを受理する (2026-05-27: 任意化、 旧禁止ルール撤廃)', () => {
      const result = createEntrySchema.safeParse({
        kind: 'tweet',
        content: 'test',
        tagIds: [],
        mood: 'neutral',
        isPublic: true,
      });
      expect(result.success).toBe(true);
    });

    it('diary で tagIds ありを受理する (2026-05-27: kind 分岐撤廃、 tag は全 kind 任意)', () => {
      const result = createEntrySchema.safeParse({
        kind: 'diary',
        content: 'test',
        tagIds: [validUuid],
        mood: 'neutral',
        isPublic: true,
      });
      expect(result.success).toBe(true);
    });

    it('tweet で 1001 文字 content を拒否する (2026-05-27: 200→1000 字制約に統一)', () => {
      const result = createEntrySchema.safeParse({
        kind: 'tweet',
        content: 'x'.repeat(1001),
        tagIds: [],
        isPublic: true,
      });
      expect(result.success).toBe(false);
    });

    it('tweet で 1000 文字 content は受理する (200 字制約は撤廃済)', () => {
      const result = createEntrySchema.safeParse({
        kind: 'tweet',
        content: 'x'.repeat(1000),
        tagIds: [],
        isPublic: true,
      });
      expect(result.success).toBe(true);
    });

    it('diary で 1001 文字 content を拒否する (base max 1000)', () => {
      const result = createEntrySchema.safeParse({
        kind: 'diary',
        content: 'x'.repeat(1001),
        tagIds: [],
        mood: 'neutral',
        isPublic: true,
      });
      expect(result.success).toBe(false);
    });

    it('knowledge で 1001 文字 content を拒否する (base max 1000)', () => {
      const result = createEntrySchema.safeParse({
        kind: 'knowledge',
        content: 'x'.repeat(1001),
        tagIds: [],
        isPublic: true,
      });
      expect(result.success).toBe(false);
    });

    it('不正な UUID の tagIds を拒否する', () => {
      const result = createEntrySchema.safeParse({
        kind: 'knowledge',
        content: 'test',
        tagIds: ['not-a-uuid'],
        isPublic: true,
      });
      expect(result.success).toBe(false);
    });

    it('isPublic が boolean でない場合を拒否する', () => {
      const result = createEntrySchema.safeParse({
        kind: 'diary',
        content: 'test',
        tagIds: [],
        mood: 'neutral',
        isPublic: 'true',
      });
      expect(result.success).toBe(false);
    });

    it('必須フィールド (isPublic) 欠落を拒否する', () => {
      const result = createEntrySchema.safeParse({
        kind: 'diary',
        content: 'test',
        tagIds: [],
        mood: 'neutral',
      });
      expect(result.success).toBe(false);
    });

    it('必須フィールド (kind) 欠落を拒否する', () => {
      const result = createEntrySchema.safeParse({
        content: 'test',
        tagIds: [],
        mood: 'neutral',
        isPublic: true,
      });
      expect(result.success).toBe(false);
    });

    it('不正な kind 値を拒否する', () => {
      const result = createEntrySchema.safeParse({
        kind: 'unknown',
        content: 'test',
        tagIds: [],
        isPublic: true,
      });
      expect(result.success).toBe(false);
    });

    it('content が数値の場合を拒否する', () => {
      const result = createEntrySchema.safeParse({
        kind: 'diary',
        content: 123,
        tagIds: [],
        mood: 'neutral',
        isPublic: true,
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('updateEntrySchema', () => {
  it('全フィールド指定の更新を受け入れる (knowledge)', () => {
    const result = updateEntrySchema.safeParse({
      kind: 'knowledge',
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

  it('空オブジェクト (何も更新しない) を受け入れる', () => {
    const result = updateEntrySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('update では 1001 文字の content を拒否する (base max 1000、superRefine は partial で外れる)', () => {
    const result = updateEntrySchema.safeParse({
      content: 'x'.repeat(1001),
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
