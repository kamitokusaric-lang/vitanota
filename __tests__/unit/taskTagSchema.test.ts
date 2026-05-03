import { describe, it, expect } from 'vitest';
import { taskTagCreateSchema } from '@/features/tasks/schemas/taskTag';

describe('taskTagCreateSchema', () => {
  it('正常系: name 1 文字', () => {
    expect(taskTagCreateSchema.safeParse({ name: 'a' }).success).toBe(true);
  });

  it('正常系: name 100 文字 (上限)', () => {
    expect(taskTagCreateSchema.safeParse({ name: 'あ'.repeat(100) }).success).toBe(true);
  });

  it('name 空は VALIDATION_ERROR', () => {
    expect(taskTagCreateSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('name 101 文字は VALIDATION_ERROR', () => {
    expect(taskTagCreateSchema.safeParse({ name: 'あ'.repeat(101) }).success).toBe(false);
  });

  it('name 欠損は VALIDATION_ERROR', () => {
    expect(taskTagCreateSchema.safeParse({}).success).toBe(false);
  });

  it('運動会など実例は通る', () => {
    expect(taskTagCreateSchema.safeParse({ name: '運動会' }).success).toBe(true);
  });
});
