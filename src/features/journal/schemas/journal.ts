// SP-U02-01: 二層バリデーション（クライアント + API 層共有）
// React Hook Form の zodResolver と Next.js API Route の schema.parse で共有
import { z } from 'zod';

// エントリ作成入力
// NFR-U02-05: content 200文字・tagIds max10
export const createEntrySchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, '記録内容を入力してください')
    .max(200, '200文字以内で入力してください'),
  tagIds: z
    .array(z.string().uuid('不正なタグIDです'))
    .max(10, 'タグは10件まで選択できます'),
  isPublic: z.boolean(),
});

export type CreateEntryInput = z.infer<typeof createEntrySchema>;

// エントリ更新入力（partial・id はパスパラメータで受ける）
export const updateEntrySchema = createEntrySchema.partial();

export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;

// タイムライン取得クエリ
export const timelineQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
});

export type TimelineQueryInput = z.infer<typeof timelineQuerySchema>;
