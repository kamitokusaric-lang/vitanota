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
