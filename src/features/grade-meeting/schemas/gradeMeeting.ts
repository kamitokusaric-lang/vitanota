// 学年会 (grade-meeting) の Zod schema (リクエスト側)。
// レスポンス schema は src/openapi/gradeMeetingSchemas.ts。
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'YYYY-MM-DD 形式で入力してください' });

export const gradeSchema = z.coerce.number().int().min(1).max(12);

// 学年会の卓上を取る。表示中の週 (from..to) に開かれた会を返す。
// その週に会が無ければ meeting=null (自動では作らない)。
export const gradeMeetingQuerySchema = z
  .object({
    grade: gradeSchema,
    from: dateString,
    to: dateString,
  })
  .openapi('GradeMeetingQuery');

// 「学年会をはじめる」。同じ学年・同じ日なら既存の会を返す (二度押しで増やさない)。
export const startGradeMeetingSchema = z
  .object({
    grade: gradeSchema,
    // 未指定なら当日 (サーバ側で決めず、クライアントのローカル日付を受ける)
    heldOn: dateString.optional(),
  })
  .openapi('StartGradeMeetingInput');

export const classNoteKindSchema = z.enum(['observe', 'orient', 'action']);

// 卓上に1行置く。kind='action' は 1回×1クラスで1行なので upsert になる。
export const addClassNoteSchema = z
  .object({
    meetingId: z.string().guid(),
    classId: z.string().guid(),
    kind: classNoteKindSchema,
    content: z
      .string()
      .trim()
      .min(1, '入力してください')
      .max(1000),
  })
  .openapi('AddClassMeetingNoteInput');

export const classNoteIdParamSchema = z
  .object({ id: z.string().guid('不正なIDです') })
  .openapi('ClassMeetingNoteIdParam');

export type GradeMeetingQuery = z.infer<typeof gradeMeetingQuerySchema>;
export type StartGradeMeetingInput = z.infer<typeof startGradeMeetingSchema>;
export type AddClassNoteInput = z.infer<typeof addClassNoteSchema>;
export type ClassNoteKindInput = z.infer<typeof classNoteKindSchema>;

// 学年の「やること」。実体は既存 tasks に作り、会に紐付ける
// (TODO の仕組みを学年会の中に二重に作らない)。
// カテゴリはタスクボードと同じものを選ぶ (/api/task-categories)。
// 担当は学年会では聞かない (chimo 2026-08-07)。必要ならタスクボードで後から付ける。
export const createGradeTaskSchema = z
  .object({
    meetingId: z.string().guid(),
    categoryId: z.string().guid(),
    // タイトル上限は既存タスク作成 (createTaskSchema) と揃える。
    // タスクボードのカード表示が 15 文字前提で組まれているため。
    title: z
      .string()
      .trim()
      .min(1, 'やることを入力してください')
      .max(15, 'やることは 15 文字以内で入力してください'),
    dueDate: dateString.optional(),
  })
  .openapi('CreateGradeMeetingTaskInput');

export const unlinkGradeTaskSchema = z
  .object({
    meetingId: z.string().guid(),
    taskId: z.string().guid(),
  })
  .openapi('UnlinkGradeMeetingTaskInput');

export type CreateGradeTaskInput = z.infer<typeof createGradeTaskSchema>;
export type UnlinkGradeTaskInput = z.infer<typeof unlinkGradeTaskSchema>;
