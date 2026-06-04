// User Filter Preferences: TaskBoard 等のフィルタ設定を教員ごとに保存する
// 入出力 Zod schemas。
//
// context='tasks' の settings 構造を定義 (将来 'journal' 等が増えたら別 schema を追加)。
// PeriodValue 型は src/features/tasks/components/PeriodFilter.tsx と同期させること。
import { z } from 'zod';

export const periodValueSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('default') }),
  z.object({
    mode: z.literal('range'),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で指定してください'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で指定してください'),
  }),
]);

export const taskFilterSettingsSchema = z.object({
  filterOwner: z.string().guid().nullable(),
  filterTagIds: z.array(z.string().guid()),
  filterCategoryIds: z.array(z.string().guid()),
  showDelegated: z.boolean(),
  period: periodValueSchema,
});

export type TaskFilterSettings = z.infer<typeof taskFilterSettingsSchema>;
