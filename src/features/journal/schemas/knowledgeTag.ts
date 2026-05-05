// ナレッジタグの Zod スキーマ (taskTag と同パターン)
import { z } from 'zod';

export const knowledgeTagCreateSchema = z.object({
  name: z
    .string()
    .min(1, 'タグ名を入力してください')
    .max(100, 'タグ名は 100 文字以内で入力してください'),
});

export type KnowledgeTagCreateInput = z.infer<typeof knowledgeTagCreateSchema>;
