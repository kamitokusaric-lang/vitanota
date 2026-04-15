// SP-U02-01: タグ関連の Zod スキーマ
import { z } from 'zod';

// タグ作成入力
export const createTagSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'タグ名を入力してください')
    .max(50, 'タグ名は50文字以内で入力してください'),
  isEmotion: z.boolean().default(false),
});

export type CreateTagInput = z.infer<typeof createTagSchema>;

// タグ削除（パスパラメータで id を受ける想定なのでスキーマは id のみ検証）
export const tagIdParamSchema = z.object({
  id: z.string().uuid('不正なタグIDです'),
});

export type TagIdParam = z.infer<typeof tagIdParamSchema>;
