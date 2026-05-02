// 機能 B: フィードバック関連の Zod スキーマ
// API ハンドラとユニットテストの両方から import するため、共通モジュールに切り出す
import { z } from 'zod';

export const feedbackSubmissionSchema = z.object({
  topicId: z.string().uuid('トピックを選択してください'),
  content: z
    .string()
    .min(1, '本文を入力してください')
    .max(5000, '本文は 5000 文字以内で入力してください'),
});

export type FeedbackSubmissionInput = z.infer<typeof feedbackSubmissionSchema>;

// system_admin によるトピック新規追加
export const feedbackTopicCreateSchema = z.object({
  title: z
    .string()
    .min(1, 'タイトルを入力してください')
    .max(100, 'タイトルは 100 文字以内で入力してください'),
  description: z.string().max(1000, 'ヒント文は 1000 文字以内で入力してください').optional().nullable(),
  sortOrder: z.number().int('整数で入力してください').default(0),
  isActive: z.boolean().default(true),
});

export type FeedbackTopicCreateInput = z.infer<typeof feedbackTopicCreateSchema>;

// system_admin によるトピック部分更新 (PATCH)
export const feedbackTopicUpdateSchema = z
  .object({
    title: z
      .string()
      .min(1, 'タイトルを入力してください')
      .max(100, 'タイトルは 100 文字以内で入力してください')
      .optional(),
    description: z.string().max(1000).optional().nullable(),
    sortOrder: z.number().int('整数で入力してください').optional(),
    isActive: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: '更新項目を 1 つ以上指定してください',
  });

export type FeedbackTopicUpdateInput = z.infer<typeof feedbackTopicUpdateSchema>;
