import { describe, it, expect } from 'vitest';
import { feedbackSubmissionSchema } from '@/features/feedback/lib/feedbackSchemas';

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
