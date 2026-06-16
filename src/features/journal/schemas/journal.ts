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

// 投稿種別。journal (倉庫/職員室ノート) 経路で作るのは 'note' のみ。
//   note : ただのメモ (is_public=false なら倉庫 / true なら一般の職員室ノート)。
// 公開/私的は kind ではなく is_public が持つ (chimo 2026-06-16・kind 再設計 / migration 0053-0054)。
// 意図つきの共有 (keep/concern/thanks/help) は staffroom schema 経由 (createBoardSchema)。
// 旧値 diary/knowledge/tweet は note へ集約済 (新規では受けない)。
export const journalEntryKindSchema = z
  .enum(['note'])
  .openapi({ example: 'note' });

export type JournalEntryKind = z.infer<typeof journalEntryKindSchema>;

// エントリ作成入力。note の content max は 1000 字。
// tagIds は emotion_tags ID (note に一本化。旧 knowledge_tags 経路は廃止)。
const createEntryBaseSchema = z.object({
  // kind は必須 (default なし)。クライアント側で各 Modal が明示的に渡す。
  kind: journalEntryKindSchema,
  content: z
    .string()
    .trim()
    .max(1000, '1000文字以内で入力してください')
    .openapi({ example: '今日の授業の振り返り' }),
  tagIds: z
    .array(z.string().guid('不正なタグIDです'))
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
