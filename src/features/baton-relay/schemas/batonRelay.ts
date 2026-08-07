// H7 朝のバトンリレー (baton-relay) Zod schema
// 循環の正本: docs/proposal/h7-circulation.md / build spec: docs/baton-relay/design.md
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'YYYY-MM-DD 形式で入力してください' });

export const studentStatusSchema = z.enum(['active', 'archived']);
// その日の印象 (0062)。サインだけでも残せる。
export const impressionSignSchema = z.enum(['good', 'concern']);
export type ImpressionSignInput = z.infer<typeof impressionSignSchema>;

// ── classes ────────────────────────────────────────────────────
export const createClassSchema = z
  .object({
    name: z.string().trim().min(1, 'クラス名を入力してください').max(50),
    goalText: z.string().trim().max(200).optional(),
    schoolYear: z.string().trim().max(16).optional(),
    // 学年 (0059)。学年会でクラスをまとめる軸。未設定なら学年会に出さない。
    grade: z.number().int().min(1).max(12).optional(),
  })
  .openapi('CreateClassInput');
export type CreateClassInput = z.infer<typeof createClassSchema>;

export const updateClassSchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    goalText: z.string().trim().max(200).nullable().optional(),
    schoolYear: z.string().trim().max(16).nullable().optional(),
    grade: z.number().int().min(1).max(12).nullable().optional(),
  })
  .openapi('UpdateClassInput');
export type UpdateClassInput = z.infer<typeof updateClassSchema>;

export const classIdParamSchema = z
  .object({ id: z.string().guid('不正なクラスIDです') })
  .openapi('ClassIdParam');

export const classResponseSchema = z
  .object({
    id: z.string().guid(),
    name: z.string(),
    goalText: z.string().nullable(),
    schoolYear: z.string().nullable(),
    grade: z.number().int().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Class');

export const classesListResponseSchema = z
  .object({ classes: z.array(classResponseSchema) })
  .openapi('ClassList');

// ── students ───────────────────────────────────────────────────
export const createStudentSchema = z
  .object({
    classId: z.string().guid(),
    displayName: z.string().trim().min(1, '名前を入力してください').max(50),
    enrolledAt: dateString.optional(),
  })
  .openapi('CreateStudentInput');
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

// 生徒の更新 (クラス移動 / 氏名の修正 / アーカイブ・復元)。少なくとも 1 項目必須。
// status を 'archived' にするとアーカイブ、'active' で復元 (left_at はサーバが導出)。
export const updateStudentSchema = z
  .object({
    classId: z.string().guid().optional(),
    displayName: z.string().trim().min(1).max(50).optional(),
    status: studentStatusSchema.optional(),
  })
  .refine((v) => v.classId || v.displayName || v.status, {
    message: '更新する項目がありません',
  })
  .openapi('UpdateStudentInput');
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const studentIdParamSchema = z
  .object({ id: z.string().guid('不正な生徒IDです') })
  .openapi('StudentIdParam');

// status 省略時は active のみ、'archived' でアーカイブ済みのみを返す。
export const listStudentsQuerySchema = z.object({
  classId: z.string().guid(),
  status: studentStatusSchema.optional(),
});

export const studentResponseSchema = z
  .object({
    id: z.string().guid(),
    classId: z.string().guid(),
    displayName: z.string(),
    status: studentStatusSchema,
    enrolledAt: z.string().nullable(),
    leftAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Student');

export const studentsListResponseSchema = z
  .object({ students: z.array(studentResponseSchema) })
  .openapi('StudentList');

// ── baton_notes (append-only) ──────────────────────────────────
// その日の印象を残す。サインだけでもよく、余裕があればコメントも書く。
// どちらも空は弾く (DB の CHECK と同じ約束)。
export const createNoteSchema = z
  .object({
    studentId: z.string().guid(),
    noteDate: dateString,
    sign: impressionSignSchema.optional(),
    content: z.string().trim().max(500).optional(),
  })
  .refine((v) => Boolean(v.sign || v.content), {
    message: 'Good か 気になる を選ぶか、ひとことを書いてください',
  })
  .openapi('CreateBatonNoteInput');
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const updateNoteSchema = z
  .object({
    sign: impressionSignSchema.nullable().optional(),
    content: z.string().trim().max(500).nullable().optional(),
  })
  .openapi('UpdateBatonNoteInput');
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export const noteIdParamSchema = z
  .object({ id: z.string().guid('不正なノートIDです') })
  .openapi('BatonNoteIdParam');

export const listNotesQuerySchema = z.object({
  classId: z.string().guid(),
  date: dateString,
});

export const batonNoteResponseSchema = z
  .object({
    id: z.string().guid(),
    studentId: z.string().guid(),
    authorUserId: z.string().guid().nullable(),
    noteDate: z.string(),
    sign: impressionSignSchema.nullable(),
    content: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('BatonNote');

export const notesListResponseSchema = z
  .object({ notes: z.array(batonNoteResponseSchema) })
  .openapi('BatonNoteList');

// ── ロスター CSV インポート ─────────────────────────────────────
// CSV はクライアントでパースし、行 (className/classGoal/studentName) を JSON で送る。
export const importRowSchema = z.object({
  className: z.string().trim().min(1).max(50),
  classGoal: z.string().trim().max(200).optional(),
  studentName: z.string().trim().min(1).max(50),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const importRequestSchema = z
  .object({
    rows: z.array(importRowSchema).min(1, '取り込む行がありません').max(2000),
  })
  .openapi('RosterImportInput');
export type ImportRequest = z.infer<typeof importRequestSchema>;

export const importResultResponseSchema = z
  .object({
    classesCreated: z.number().int(),
    classesUpdated: z.number().int(),
    studentsAdded: z.number().int(),
    studentsSkipped: z.number().int(),
  })
  .openapi('RosterImportResult');
export type ImportResult = z.infer<typeof importResultResponseSchema>;
