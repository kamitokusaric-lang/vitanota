// 開発者からのお知らせ (announcements) の入出力 Zod schemas
// publish_date は YYYY-MM-DD 文字列で受ける (chimo 指定の公開日)
// body は string[] (行ごとの箱条書き)、空配列 OK
import { z } from 'zod';

const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;

export const announcementCreateSchema = z.object({
  publishDate: z
    .string()
    .regex(ymdRegex, 'YYYY-MM-DD 形式で指定してください'),
  title: z
    .string()
    .trim()
    .min(1, 'タイトルを入力してください')
    .max(500, 'タイトルは 500 文字以内で入力してください'),
  body: z.array(z.string()).default([]),
});

export type AnnouncementCreateInput = z.infer<typeof announcementCreateSchema>;

export const announcementUpdateSchema = z
  .object({
    publishDate: z.string().regex(ymdRegex).optional(),
    title: z.string().trim().min(1).max(500).optional(),
    body: z.array(z.string()).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: '更新項目がありません',
  });

export type AnnouncementUpdateInput = z.infer<typeof announcementUpdateSchema>;

// API レスポンス共通型 (公開エンドポイント / system_admin 両方)
export interface AnnouncementDTO {
  id: string;
  publishDate: string; // YYYY-MM-DD
  title: string;
  body: string[];
  createdAt: string;
  updatedAt: string;
}
