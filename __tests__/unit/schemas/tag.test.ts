import { describe, it, expect } from 'vitest';
import { createTagSchema, tagIdParamSchema } from '@/features/journal/schemas/tag';

describe('createTagSchema', () => {
  describe('正常系', () => {
    it('最小1文字のタグ名を受け入れる', () => {
      const result = createTagSchema.safeParse({ name: 'a', type: 'context' });
      expect(result.success).toBe(true);
    });

    it('最大50文字のタグ名を受け入れる', () => {
      const result = createTagSchema.safeParse({
        name: 'x'.repeat(50),
        type: 'context',
      });
      expect(result.success).toBe(true);
    });

    it('type のデフォルト値は context', () => {
      const result = createTagSchema.safeParse({ name: 'test' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('context');
      }
    });

    it('type=emotion + category を受け入れる', () => {
      const result = createTagSchema.safeParse({
        name: 'うれしい',
        type: 'emotion',
        category: 'positive',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('emotion');
        expect(result.data.category).toBe('positive');
      }
    });

    it('前後の空白を trim する', () => {
      const result = createTagSchema.safeParse({ name: '  test  ' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('test');
      }
    });
  });

  describe('異常系', () => {
    it('空文字列を拒否する', () => {
      const result = createTagSchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    it('空白のみを拒否する', () => {
      const result = createTagSchema.safeParse({ name: '   ' });
      expect(result.success).toBe(false);
    });

    it('51文字を拒否する', () => {
      const result = createTagSchema.safeParse({ name: 'x'.repeat(51) });
      expect(result.success).toBe(false);
    });

    it('name フィールド欠落を拒否する', () => {
      const result = createTagSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('name が数値の場合を拒否する', () => {
      const result = createTagSchema.safeParse({ name: 123 });
      expect(result.success).toBe(false);
    });
  });
});

describe('tagIdParamSchema', () => {
  it('有効な UUID を受け入れる', () => {
    const result = tagIdParamSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('不正なUUIDを拒否する', () => {
    const result = tagIdParamSchema.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('数値を拒否する', () => {
    const result = tagIdParamSchema.safeParse({ id: 123 });
    expect(result.success).toBe(false);
  });

  it('空文字を拒否する', () => {
    const result = tagIdParamSchema.safeParse({ id: '' });
    expect(result.success).toBe(false);
  });
});
