// 学年会 (grade-meeting) の OpenAPI レスポンススキーマ。
// 入力 (body/query) は src/features/grade-meeting/schemas/gradeMeeting.ts に定義。
//
// ★ 卓上の行に author は含めない (無記名)。
//   「誰がどの前提を出したか」を API に出さないのが Orient の動作条件。
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// 学年会に出るクラス (学年が設定されているものだけ・クラス名順)。
export const gradeClassViewSchema = z
  .object({
    id: z.string().guid(),
    name: z.string().openapi({ example: '1-A' }),
    goalText: z.string().nullable(),
  })
  .openapi('GradeClassView');

export const gradeMeetingSummarySchema = z
  .object({
    id: z.string().guid(),
    grade: z.number().int().openapi({ example: 1 }),
    heldOn: z.string().openapi({ example: '2026-08-20' }),
  })
  .openapi('GradeMeetingSummary');

// 卓上の1行。observe=事実 / orient=その事実の意味 / action=次の一手。
// author は返さない (無記名)。
export const classMeetingNoteViewSchema = z
  .object({
    id: z.string().guid(),
    classId: z.string().guid(),
    kind: z.enum(['observe', 'orient', 'action']),
    content: z.string(),
    createdAt: z.string().datetime(),
  })
  .openapi('ClassMeetingNoteView');

// 学年の「やること」。実体は既存 tasks (担当・完了はタスク側で操作する)。
export const gradeTaskViewSchema = z
  .object({
    taskId: z.string().guid(),
    title: z.string(),
    dueDate: z.string().nullable(),
    status: z.string().openapi({ example: 'backlog' }),
    categoryId: z.string().guid(),
    // 学年会では担当を付けない。タスクボードで付いていればここに出る。
    assignees: z.array(
      z.object({ userId: z.string().guid(), name: z.string().nullable() }),
    ),
  })
  .openapi('GradeMeetingTaskView');

// GET /api/grade-meeting のレスポンス。
export const gradeMeetingBoardResponseSchema = z
  .object({
    grade: z.number().int(),
    // 学年会を開ける学年 (クラスに学年が付いている学年だけ)
    availableGrades: z.array(z.number().int()),
    classes: z.array(gradeClassViewSchema),
    meeting: gradeMeetingSummarySchema.nullable(),
    notes: z.array(classMeetingNoteViewSchema),
    previousMeeting: gradeMeetingSummarySchema.nullable(),
    previousActions: z.array(classMeetingNoteViewSchema),
    gradeTasks: z.array(gradeTaskViewSchema),
  })
  .openapi('GradeMeetingBoardResponse');

export const gradeMeetingStartResponseSchema = z
  .object({ meeting: gradeMeetingSummarySchema })
  .openapi('GradeMeetingStartResponse');

export const classMeetingNoteResponseSchema = z
  .object({ note: classMeetingNoteViewSchema })
  .openapi('ClassMeetingNoteResponse');

export const gradeTaskResponseSchema = z
  .object({ task: gradeTaskViewSchema })
  .openapi('GradeMeetingTaskResponse');
