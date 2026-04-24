// SP-U02-01: 二層バリデーション（クライアント + API 層共有）
// React Hook Form の zodResolver と Next.js API Route の schema.parse で共有
// + Step 18: zod-to-openapi で OpenAPI 仕様自動生成のメタデータを付与
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// 投稿ムード (絵文字ベース・必須)
export const moodLevelSchema = z
  .enum(['very_positive', 'positive', 'neutral', 'negative', 'very_negative'])
  .openapi({ example: 'neutral' });

export type MoodLevel = z.infer<typeof moodLevelSchema>;

// エントリ作成入力
// NFR-U02-05: content 200文字
// mood はタグ必須化の代わりに必須化した軽量なムード選択 (絵文字 5 段階)
export const createEntrySchema = z
  .object({
    // content は任意。ムード必須化の代わりに、絵文字だけで投稿可能にする。
    // 空文字許容、上限 200 文字。
    content: z
      .string()
      .trim()
      .max(200, '200文字以内で入力してください')
      .openapi({ example: '今日の授業の振り返り' }),
    tagIds: z
      .array(z.string().uuid('不正なタグIDです'))
      .openapi({ example: [] }),
    isPublic: z.boolean().openapi({ example: true }),
    mood: moodLevelSchema,
  })
  .openapi('CreateEntryInput');

export type CreateEntryInput = z.infer<typeof createEntrySchema>;

// エントリ更新入力（partial・id はパスパラメータで受ける）
export const updateEntrySchema = createEntrySchema.partial().openapi('UpdateEntryInput');

export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;

// タイムライン取得クエリ
export const timelineQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).openapi({ example: 1 }),
    perPage: z.coerce.number().int().min(1).max(50).default(50).openapi({ example: 50 }),
  })
  .openapi('TimelineQuery');

export type TimelineQueryInput = z.infer<typeof timelineQuerySchema>;
