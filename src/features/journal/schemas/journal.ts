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
//   diary     : 日々ノート (mood 必須 + content 1000字、タグ不可) — edit 経路のみで使用
//   knowledge : ナレッジノート (content 1000字 + knowledge_tags 任意) — edit 経路のみで使用
//   tweet     : 「ひとこと残す」(content 1000字 + emotion_tags 任意) — 新規投稿のデフォルト
// 2026-05-27: 新規投稿入口を tweet 単一 CTA に統合 (H6/H8 仮説検証)。
//   diary / knowledge は既存レコードの edit 経路で kind を保持する目的でのみ enum に残る。
export const journalEntryKindSchema = z
  .enum(['diary', 'knowledge', 'tweet'])
  .openapi({ example: 'tweet' });

export type JournalEntryKind = z.infer<typeof journalEntryKindSchema>;

// エントリ作成入力 (kind 別制約は superRefine で担保、DB CHECK は付けない)
// content の max は全 kind 1000 字統一 (2026-05-27 tweet を 200→1000 に拡張)
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

// 2026-05-27 chimo 指示: kind 分岐撤廃、 全 kind 共通仕様 (mood 任意 + tag 任意)。
// 旧 diary mood 必須 / diary タグ禁止ルールは削除。
export const createEntrySchema = createEntryBaseSchema.openapi(
  'CreateEntryInput',
);

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

// H9 検証 (2026-05-27): 投稿カードの reaction 種別 (migration 0046)
//   knowledge    : 参考になった (旧「ナレッジリアクション」)
//   appreciation : お疲れ様です
//   endorsement  : すてきです
export const journalReactionTypeSchema = z
  .enum(['knowledge', 'appreciation', 'endorsement'])
  .openapi({ example: 'knowledge' });

export type JournalReactionType = z.infer<typeof journalReactionTypeSchema>;

// POST body / DELETE query 共通: reaction の種別を 1 つ受ける
export const reactionTypeQuerySchema = z
  .object({ type: journalReactionTypeSchema })
  .openapi('ReactionTypeQuery');
