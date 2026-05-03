// 機能拡張 (5/7 説明会向け): タスクタグの Zod スキーマ
import { z } from 'zod';

export const taskTagCreateSchema = z.object({
  name: z
    .string()
    .min(1, 'タグ名を入力してください')
    .max(100, 'タグ名は 100 文字以内で入力してください'),
});

export type TaskTagCreateInput = z.infer<typeof taskTagCreateSchema>;
