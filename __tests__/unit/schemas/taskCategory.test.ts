import { describe, it, expect } from 'vitest';
import {
  taskCategoryCreateSchema,
  taskCategoryUpdateSchema,
  taskCategoryDeleteSchema,
} from '@/schemas/taskCategory';

const validUuid = '550e8400-e29b-41d4-a716-446655440000';
const validUuid2 = '550e8400-e29b-41d4-a716-446655440001';

describe('taskCategoryCreateSchema', () => {
  it('最小構成 (name + tenantId) を受け入れる、default で sortOrder=0 / isSystemDefault=false', () => {
    const result = taskCategoryCreateSchema.safeParse({
      tenantId: validUuid,
      name: 'クラス業務',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortOrder).toBe(0);
      expect(result.data.isSystemDefault).toBe(false);
    }
  });

  it('全フィールド指定を受け入れる', () => {
    const result = taskCategoryCreateSchema.safeParse({
      tenantId: validUuid,
      name: '事務業務',
      sortOrder: 20,
      isSystemDefault: true,
    });
    expect(result.success).toBe(true);
  });

  it('name の前後空白を trim する', () => {
    const result = taskCategoryCreateSchema.safeParse({
      tenantId: validUuid,
      name: '  事務業務  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('事務業務');
    }
  });

  it('name 50 文字までを受け入れる', () => {
    const result = taskCategoryCreateSchema.safeParse({
      tenantId: validUuid,
      name: 'x'.repeat(50),
    });
    expect(result.success).toBe(true);
  });

  it('name 51 文字を拒否する', () => {
    const result = taskCategoryCreateSchema.safeParse({
      tenantId: validUuid,
      name: 'x'.repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it('name 空文字を拒否する', () => {
    const result = taskCategoryCreateSchema.safeParse({
      tenantId: validUuid,
      name: '',
    });
    expect(result.success).toBe(false);
  });

  it('name 空白のみを (trim 後 空で) 拒否する', () => {
    const result = taskCategoryCreateSchema.safeParse({
      tenantId: validUuid,
      name: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('tenantId が UUID でないと拒否する', () => {
    const result = taskCategoryCreateSchema.safeParse({
      tenantId: 'not-a-uuid',
      name: 'X',
    });
    expect(result.success).toBe(false);
  });

  it('sortOrder が負数だと拒否する', () => {
    const result = taskCategoryCreateSchema.safeParse({
      tenantId: validUuid,
      name: 'X',
      sortOrder: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe('taskCategoryUpdateSchema', () => {
  it('name のみの部分更新を受け入れる', () => {
    const result = taskCategoryUpdateSchema.safeParse({ name: '新カテゴリ名' });
    expect(result.success).toBe(true);
  });

  it('isSystemDefault のみの部分更新を受け入れる', () => {
    const result = taskCategoryUpdateSchema.safeParse({ isSystemDefault: true });
    expect(result.success).toBe(true);
  });

  it('全フィールド指定を受け入れる', () => {
    const result = taskCategoryUpdateSchema.safeParse({
      name: 'X',
      sortOrder: 10,
      isSystemDefault: false,
    });
    expect(result.success).toBe(true);
  });

  it('空オブジェクトは拒否 (更新項目がない)', () => {
    const result = taskCategoryUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('name 51 文字を拒否', () => {
    const result = taskCategoryUpdateSchema.safeParse({
      name: 'x'.repeat(51),
    });
    expect(result.success).toBe(false);
  });
});

describe('taskCategoryDeleteSchema', () => {
  it('moveTo なし (空オブジェクト) を受け入れる', () => {
    const result = taskCategoryDeleteSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('moveTo=null を受け入れる', () => {
    const result = taskCategoryDeleteSchema.safeParse({ moveTo: null });
    expect(result.success).toBe(true);
  });

  it('moveTo に UUID を受け入れる', () => {
    const result = taskCategoryDeleteSchema.safeParse({ moveTo: validUuid });
    expect(result.success).toBe(true);
  });

  it('moveTo が UUID でない文字列を拒否', () => {
    const result = taskCategoryDeleteSchema.safeParse({ moveTo: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});
