// 感情タグ関連の Zod スキーマ
// 0016 で context タグは廃止 (task_categories に役割移譲)
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// 感情タグ作成入力
export const createTagSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'タグ名を入力してください')
      .max(50, 'タグ名は50文字以内で入力してください')
      .openapi({ example: '喜び' }),
    category: z
      .enum(['positive', 'negative', 'neutral'])
      .openapi({ example: 'positive' }),
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
