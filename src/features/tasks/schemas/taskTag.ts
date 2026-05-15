// 機能拡張 (5/7 説明会向け): タスクタグの Zod スキーマ
import { z } from 'zod';

// 教員用: POST /api/task-tags (ctx.tenantId 自動取得)
export const taskTagCreateSchema = z.object({
  name: z
    .string()
    .min(1, 'タグ名を入力してください')
    .max(100, 'タグ名は 100 文字以内で入力してください'),
});

export type TaskTagCreateInput = z.infer<typeof taskTagCreateSchema>;

// system_admin 用: POST /api/system/task-tags (tenantId 明示)
export const taskTagSystemCreateSchema = z.object({
  tenantId: z.string().uuid('不正な tenantId です'),
  name: z
    .string()
    .trim()
    .min(1, 'タグ名を入力してください')
    .max(100, 'タグ名は 100 文字以内で入力してください'),
});

export type TaskTagSystemCreateInput = z.infer<typeof taskTagSystemCreateSchema>;

// system_admin 用: PATCH /api/system/task-tags/{id} (名前変更)
export const taskTagUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'タグ名を入力してください')
    .max(100, 'タグ名は 100 文字以内で入力してください'),
});

export type TaskTagUpdateInput = z.infer<typeof taskTagUpdateSchema>;

// system_admin 用: DELETE /api/system/task-tags/{id} (moveTo 指定で移管 + 削除)
export const taskTagDeleteSchema = z.object({
  moveTo: z.string().uuid().nullable().optional(),
});

export type TaskTagDeleteInput = z.infer<typeof taskTagDeleteSchema>;
