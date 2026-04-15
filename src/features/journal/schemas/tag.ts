// SP-U02-01: タグ関連の Zod スキーマ
// + Step 18: zod-to-openapi メタデータ
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// タグ作成入力
export const createTagSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'タグ名を入力してください')
      .max(50, 'タグ名は50文字以内で入力してください')
      .openapi({ example: 'うれしい' }),
    isEmotion: z.boolean().default(false).openapi({ example: true }),
  })
  .openapi('CreateTagInput');

export type CreateTagInput = z.infer<typeof createTagSchema>;

// タグ削除（パスパラメータで id を受ける想定なのでスキーマは id のみ検証）
export const tagIdParamSchema = z
  .object({
    id: z.string().uuid('不正なタグIDです').openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
  })
  .openapi('TagIdParam');

export type TagIdParam = z.infer<typeof tagIdParamSchema>;
