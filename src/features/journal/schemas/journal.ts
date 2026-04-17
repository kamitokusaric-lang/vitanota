// SP-U02-01: 二層バリデーション（クライアント + API 層共有）
// React Hook Form の zodResolver と Next.js API Route の schema.parse で共有
// + Step 18: zod-to-openapi で OpenAPI 仕様自動生成のメタデータを付与
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// エントリ作成入力
// NFR-U02-05: content 200文字
// Unit-03: tagIds の上限撤廃（タグはシステム定義 23個 + 管理者追加分）
export const createEntrySchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, '記録内容を入力してください')
      .max(200, '200文字以内で入力してください')
      .openapi({ example: '今日の授業の振り返り' }),
    tagIds: z
      .array(z.string().uuid('不正なタグIDです'))
      .openapi({ example: [] }),
    isPublic: z.boolean().openapi({ example: true }),
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
    perPage: z.coerce.number().int().min(1).max(50).default(20).openapi({ example: 20 }),
  })
  .openapi('TimelineQuery');

export type TimelineQueryInput = z.infer<typeof timelineQuerySchema>;
