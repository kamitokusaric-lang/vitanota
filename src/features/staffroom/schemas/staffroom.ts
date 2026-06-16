// H7-B 職員室ボード (staffroom) Zod schema
// 循環の正本: docs/proposal/h7-circulation.md / build spec: docs/staffroom/design.md
//
// 板の投稿は journal_entries(kind='board') として持つ。is_public=false 固定で
// 個人の共有タイムラインには載せず、staffroom 側 RLS で全教員可視にする。
// リアクション (3 種) は既存 journal の reaction route を再利用 (このファイルでは扱わない)。
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// 職員室ボードで投稿できる board ネイティブ kind (= journal_entry_kind の直値)。
//   keep 続けたい / concern 気になる / thanks ありがとう / help たすけて
export const staffroomBoardKindSchema = z.enum(['keep', 'concern', 'thanks', 'help']);
export type StaffroomBoardKindInput = z.infer<typeof staffroomBoardKindSchema>;

// 職員室ボードに集める kind = board ネイティブ 4 種 + knowledge(なるほど集計) + note(公開メモ)。
// 公開/私的は is_public が持つ (kind 再設計 2026-06-16)。私的 note は届かない。
// note は旧 tweet/knowledge の公開投稿の集約先 (なるほどが付けば「役に立つ情報」箱に集計)。
export const staffroomBoxKindSchema = z.enum([
  'keep',
  'concern',
  'thanks',
  'help',
  'knowledge',
  'note',
]);
export type StaffroomBoxKindInput = z.infer<typeof staffroomBoxKindSchema>;

// ── board (投稿) ───────────────────────────────────────────────
// is_public は他 kind と同じく本人選択 (default true = 公開 / false = 自分だけ)。
export const createBoardSchema = z
  .object({
    boardKind: staffroomBoardKindSchema,
    content: z.string().trim().min(1, '内容を入力してください').max(2000),
    isPublic: z.boolean().optional(), // 未指定は公開 (service 側で default true)
    // 任意: 特定の生徒/クラスに紐づく共有 (A→B seam で使う。S3 では受け取りのみ)
    studentId: z.string().guid().optional(),
    classId: z.string().guid().optional(),
  })
  .openapi('CreateStaffroomBoardInput');
export type CreateBoardInput = z.infer<typeof createBoardSchema>;

export const listBoardQuerySchema = z.object({
  boardKind: staffroomBoxKindSchema.optional(),
  classId: z.string().guid().optional(),
  // 投稿日 (created_at) の期間絞り込み (JST 日付・両端含む)。未指定は今週 (service 既定)。
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// リアクション (既存 journal 3 種を再利用)。count + 自分が押したか。
const reactionStateSchema = z.object({ count: z.number().int(), mine: z.boolean() });
export const boardReactionsSchema = z.object({
  knowledge: reactionStateSchema,
  appreciation: reactionStateSchema,
  endorsement: reactionStateSchema,
});

export const boardResponseSchema = z
  .object({
    id: z.string().guid(),
    boardKind: staffroomBoxKindSchema,
    content: z.string(),
    isPublic: z.boolean(),
    studentId: z.string().guid().nullable(),
    classId: z.string().guid().nullable(),
    authorUserId: z.string().guid().nullable(),
    reactions: boardReactionsSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('StaffroomBoard');

export const boardListResponseSchema = z
  .object({ boards: z.array(boardResponseSchema) })
  .openapi('StaffroomBoardList');

// ── 生徒サポート (A→B seam: 朝バトンをクラス(学年)別に集約) ──
// 印が付いた生徒を クラスごとに 名前 + 印件数 + 今週の一言 で返す。
const supportStudentSchema = z.object({
  studentId: z.string().guid(),
  displayName: z.string(),
  positiveCount: z.number().int(),
  concernCount: z.number().int(),
  notes: z.array(z.string()),
});
const supportClassSchema = z.object({
  classId: z.string().guid(),
  className: z.string(),
  schoolYear: z.string().nullable(),
  students: z.array(supportStudentSchema),
});
export const studentSupportResponseSchema = z
  .object({ classes: z.array(supportClassSchema) })
  .openapi('StaffroomStudentSupport');
