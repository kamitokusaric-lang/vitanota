import { describe, it, expect } from 'vitest';
import {
  feedbackSubmissionSchema,
  feedbackTopicCreateSchema,
  feedbackTopicUpdateSchema,
} from '@/features/feedback/lib/feedbackSchemas';

const validTopicId = '11111111-1111-1111-1111-111111111111';

describe('feedbackSubmissionSchema', () => {
  it('正常系: topicId 有効 + content 1 文字', () => {
    const result = feedbackSubmissionSchema.safeParse({
      topicId: validTopicId,
      content: 'a',
    });
    expect(result.success).toBe(true);
  });

  it('正常系: content 5000 文字 (上限)', () => {
    const result = feedbackSubmissionSchema.safeParse({
      topicId: validTopicId,
      content: 'a'.repeat(5000),
    });
    expect(result.success).toBe(true);
  });

  it('content 0 文字は VALIDATION_ERROR', () => {
    const result = feedbackSubmissionSchema.safeParse({
      topicId: validTopicId,
      content: '',
    });
    expect(result.success).toBe(false);
  });

  it('content 5001 文字は VALIDATION_ERROR', () => {
    const result = feedbackSubmissionSchema.safeParse({
      topicId: validTopicId,
      content: 'a'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  it('topicId が UUID 形式でない場合は VALIDATION_ERROR', () => {
    const result = feedbackSubmissionSchema.safeParse({
      topicId: 'not-a-uuid',
      content: 'おすすめ機能あります',
    });
    expect(result.success).toBe(false);
  });

  it('topicId 欠損は VALIDATION_ERROR', () => {
    const result = feedbackSubmissionSchema.safeParse({
      content: '本文だけ',
    });
    expect(result.success).toBe(false);
  });

  it('content 欠損は VALIDATION_ERROR', () => {
    const result = feedbackSubmissionSchema.safeParse({
      topicId: validTopicId,
    });
    expect(result.success).toBe(false);
  });
});

describe('feedbackTopicCreateSchema', () => {
  it('正常系: title のみ (sortOrder=0 / isActive=true がデフォルト)', () => {
    const result = feedbackTopicCreateSchema.safeParse({ title: '改善してほしい点' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortOrder).toBe(0);
      expect(result.data.isActive).toBe(true);
    }
  });

  it('正常系: 全項目指定', () => {
    const result = feedbackTopicCreateSchema.safeParse({
      title: 'あったら嬉しい機能',
      description: 'こういう機能があれば使ってみたいと感じたものがあれば',
      sortOrder: 20,
      isActive: false,
    });
    expect(result.success).toBe(true);
  });

  it('title 空は VALIDATION_ERROR', () => {
    const result = feedbackTopicCreateSchema.safeParse({ title: '' });
    expect(result.success).toBe(false);
  });

  it('title 101 文字は VALIDATION_ERROR', () => {
    const result = feedbackTopicCreateSchema.safeParse({ title: 'あ'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('description が null でも通る (任意項目)', () => {
    const result = feedbackTopicCreateSchema.safeParse({
      title: 'タイトル',
      description: null,
    });
    expect(result.success).toBe(true);
  });

  it('sortOrder が小数の場合は VALIDATION_ERROR (整数のみ)', () => {
    const result = feedbackTopicCreateSchema.safeParse({
      title: 'タイトル',
      sortOrder: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe('feedbackTopicUpdateSchema', () => {
  it('正常系: title のみ更新', () => {
    const result = feedbackTopicUpdateSchema.safeParse({ title: '新しいタイトル' });
    expect(result.success).toBe(true);
  });

  it('正常系: isActive のみ更新 (無効化)', () => {
    const result = feedbackTopicUpdateSchema.safeParse({ isActive: false });
    expect(result.success).toBe(true);
  });

  it('空オブジェクトは VALIDATION_ERROR (更新項目 1 つ以上必須)', () => {
    const result = feedbackTopicUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('title 101 文字は VALIDATION_ERROR', () => {
    const result = feedbackTopicUpdateSchema.safeParse({ title: 'あ'.repeat(101) });
    expect(result.success).toBe(false);
  });
});
