// SP-U02-01: 二層バリデーション（クライアント + API 層共有）
// React Hook Form の zodResolver と Next.js API Route の schema.parse で共有
// + Step 18: zod-to-openapi で OpenAPI 仕様自動生成のメタデータを付与
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// 投稿ムード (絵文字ベース・必須)
export const moodLevelSchema = z
  .enum(['very_positive', 'positive', 'neutral', 'negative', 'very_negative'])
  .openapi({ example: 'neutral' });

export type MoodLevel = z.infer<typeof moodLevelSchema>;

// 投稿種別 (migration 0030)
//   diary     : 日々ノート (mood 必須 + content 1000字、タグ不可)
//   knowledge : ナレッジ共有 (content 1000字 + knowledge_tags 任意)
//   tweet     : つぶやき (content 200字 + emotion_tags 任意)
export const journalEntryKindSchema = z
  .enum(['diary', 'knowledge', 'tweet'])
  .openapi({ example: 'diary' });

export type JournalEntryKind = z.infer<typeof journalEntryKindSchema>;

// エントリ作成入力 (kind 別制約は superRefine で担保、DB CHECK は付けない)
// content の max は diary/knowledge=1000、tweet は superRefine で 200 に絞る
// tagIds は kind=tweet → emotion_tags ID / kind=knowledge → knowledge_tags ID
//   (どちらの tag store を参照するかは API 層で kind を見て分岐)
const createEntryBaseSchema = z.object({
  // kind は必須 (default なし)。クライアント側で各 Modal が明示的に渡す。
  kind: journalEntryKindSchema,
  content: z
    .string()
    .trim()
    .max(1000, '1000文字以内で入力してください')
    .openapi({ example: '今日の授業の振り返り' }),
  tagIds: z
    .array(z.string().uuid('不正なタグIDです'))
    .openapi({ example: [] }),
  isPublic: z.boolean().openapi({ example: true }),
  mood: moodLevelSchema.nullable().optional(),
});

export const createEntrySchema = createEntryBaseSchema
  .superRefine((data, ctx) => {
    // tweet は 200 字
    if (data.kind === 'tweet' && data.content.length > 200) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: 'つぶやきは200文字以内で入力してください',
      });
    }
    // mood は diary 必須、それ以外で禁止
    if (data.kind === 'diary' && !data.mood) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mood'],
        message: '日誌には気分の選択が必要です',
      });
    }
    if (data.kind !== 'diary' && data.mood) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mood'],
        message: 'この種別には気分は付けられません',
      });
    }
    // tagIds は diary で禁止 (knowledge/tweet は許容)
    if (data.kind === 'diary' && data.tagIds.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tagIds'],
        message: '日誌にはタグは付けられません',
      });
    }
  })
  .openapi('CreateEntryInput');

export type CreateEntryInput = z.infer<typeof createEntrySchema>;

// エントリ更新入力（partial・id はパスパラメータで受ける）
// 注: superRefine 後の ZodEffects は .partial() 不可なので base から派生
export const updateEntrySchema = createEntryBaseSchema
  .partial()
  .openapi('UpdateEntryInput');

export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;

// タイムライン取得クエリ
export const timelineQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).openapi({ example: 1 }),
    perPage: z.coerce.number().int().min(1).max(50).default(50).openapi({ example: 50 }),
  })
  .openapi('TimelineQuery');

export type TimelineQueryInput = z.infer<typeof timelineQuerySchema>;
