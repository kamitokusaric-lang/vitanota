// system_admin によるタスクカテゴリ CRUD の入出力 Zod schemas
// 既存 task_categories テーブル制約と整合:
//   - name: varchar(50)、tenant 内 UNIQUE
//   - (tenant_id, name) UNIQUE
//   - sortOrder: integer default 0
//   - isSystemDefault: boolean default false
import { z } from 'zod';

export const taskCategoryCreateSchema = z.object({
  tenantId: z.string().guid('不正な tenantId です'),
  name: z
    .string()
    .trim()
    .min(1, 'カテゴリ名を入力してください')
    .max(50, 'カテゴリ名は 50 文字以内で入力してください'),
  sortOrder: z.number().int().min(0).default(0),
  isSystemDefault: z.boolean().default(false),
});

export type TaskCategoryCreateInput = z.infer<typeof taskCategoryCreateSchema>;

export const taskCategoryUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    sortOrder: z.number().int().min(0).optional(),
    isSystemDefault: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: '更新項目がありません',
  });

export type TaskCategoryUpdateInput = z.infer<typeof taskCategoryUpdateSchema>;

// 削除時のオプション: moveTo を指定するとタスクをそのカテゴリに移動してから削除
// null / 未指定なら移動なし (タスクがあれば FK RESTRICT で 409)
export const taskCategoryDeleteSchema = z.object({
  moveTo: z.string().guid().nullable().optional(),
});

export type TaskCategoryDeleteInput = z.infer<typeof taskCategoryDeleteSchema>;
