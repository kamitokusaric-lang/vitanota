// 学年会 (grade-meeting) Repository。
// RLS が可視・書込の境界を担保する (withTenantUser は service 側で張る)。
//
// ★ 無記名: 返す型に authorUserId を含めない。
//   「誰がどの前提を出したか」を UI/API に出さないのが Orient の動作条件。
//   DB の author_user_id は「自分の行だけ消す・直す」判定にしか使わない。
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import {
  classMeetingNotes,
  gradeMeetings,
  gradeMeetingTasks,
  classes,
  tasks,
  taskAssignees,
  users,
} from '@/db/schema';
import type * as schema from '@/db/schema';
import type { GradeMeeting } from '@/db/schema';
import type { ClassNoteKind } from '../constants';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export interface GradeMeetingContext {
  userId: string;
  tenantId: string;
}

// 卓上に並ぶ1行。authorUserId は**含めない** (無記名)。
export type ClassNoteView = {
  id: string;
  classId: string;
  kind: ClassNoteKind;
  content: string;
  createdAt: Date;
};

// 学年会に出すクラス (学年が設定されているものだけ)。
export type GradeClassView = {
  id: string;
  name: string;
  goalText: string | null;
};

// 学年の「やること」(実体は既存 tasks)。担当・完了の操作はタスク側に任せる。
export type GradeTaskAssignee = { userId: string; name: string | null };

export type GradeTaskView = {
  taskId: string;
  title: string;
  dueDate: string | null;
  status: string;
  categoryId: string;
  // 担当者 (タスクボードで拾われるために必ず1名以上いる)。
  assignees: GradeTaskAssignee[];
};

// tasks.due_date は date モード (Date) なので YYYY-MM-DD に落とす。
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export class GradeMeetingRepository {
  // その学年のクラス。学年未設定 (grade IS NULL) は出さない。
  // 並びはクラス名順で固定する (「活発な順」等のソートを作らない = 優劣を立てない)。
  async listClassesByGrade(
    tx: DrizzleDb,
    grade: number,
    ctx: GradeMeetingContext,
  ): Promise<GradeClassView[]> {
    return tx
      .select({
        id: classes.id,
        name: classes.name,
        goalText: classes.goalText,
      })
      .from(classes)
      .where(and(eq(classes.tenantId, ctx.tenantId), eq(classes.grade, grade)))
      .orderBy(asc(classes.name));
  }

  // 学年会を開ける学年 = クラスに学年が設定されている学年だけ。
  // ハードコードせず実データから引く (中学なら1〜3年しか出ない)。
  async listAvailableGrades(
    tx: DrizzleDb,
    ctx: GradeMeetingContext,
  ): Promise<number[]> {
    const rows = await tx
      .selectDistinct({ grade: classes.grade })
      .from(classes)
      .where(and(eq(classes.tenantId, ctx.tenantId), isNotNull(classes.grade)))
      .orderBy(asc(classes.grade));
    return rows
      .map((r) => r.grade)
      .filter((g): g is number => g !== null);
  }

  // 直近の学年会。無ければ null (自動では作らない)。
  async findLatestMeeting(
    tx: DrizzleDb,
    grade: number,
    ctx: GradeMeetingContext,
  ): Promise<GradeMeeting | null> {
    const [row] = await tx
      .select()
      .from(gradeMeetings)
      .where(
        and(eq(gradeMeetings.tenantId, ctx.tenantId), eq(gradeMeetings.grade, grade)),
      )
      .orderBy(desc(gradeMeetings.heldOn), desc(gradeMeetings.createdAt))
      .limit(1);
    return row ?? null;
  }

  // 表示中の週に開かれた学年会。無ければ null。
  // 同じ週に複数回あれば、直近の回を出す。
  async findMeetingInRange(
    tx: DrizzleDb,
    grade: number,
    period: { from: string; to: string },
    ctx: GradeMeetingContext,
  ): Promise<GradeMeeting | null> {
    const [row] = await tx
      .select()
      .from(gradeMeetings)
      .where(
        and(
          eq(gradeMeetings.tenantId, ctx.tenantId),
          eq(gradeMeetings.grade, grade),
          sql`${gradeMeetings.heldOn} >= ${period.from}`,
          sql`${gradeMeetings.heldOn} <= ${period.to}`,
        ),
      )
      .orderBy(desc(gradeMeetings.heldOn), desc(gradeMeetings.createdAt))
      .limit(1);
    return row ?? null;
  }

  // 1つ前の会 (前回の一手を今回の冒頭に出すため)。
  async findPreviousMeeting(
    tx: DrizzleDb,
    grade: number,
    beforeHeldOn: string,
    ctx: GradeMeetingContext,
  ): Promise<GradeMeeting | null> {
    const [row] = await tx
      .select()
      .from(gradeMeetings)
      .where(
        and(
          eq(gradeMeetings.tenantId, ctx.tenantId),
          eq(gradeMeetings.grade, grade),
          sql`${gradeMeetings.heldOn} < ${beforeHeldOn}`,
        ),
      )
      .orderBy(desc(gradeMeetings.heldOn))
      .limit(1);
    return row ?? null;
  }

  // 会をはじめる。同じ学年・同じ日なら既存を返す (二度押しで増やさない)。
  //
  // ここを ON CONFLICT DO UPDATE で書かないのは意図的。
  // 「その日に集まった」という記録は後から書き換わるべきものではないので、
  // grade_meetings に UPDATE ポリシーを置いていない (RLS が DO UPDATE を弾く)。
  // 入らなかったら既存を読む、の2段で表現する。
  async startMeeting(
    tx: DrizzleDb,
    params: { grade: number; heldOn: string },
    ctx: GradeMeetingContext,
  ): Promise<GradeMeeting> {
    const [inserted] = await tx
      .insert(gradeMeetings)
      .values({
        tenantId: ctx.tenantId,
        grade: params.grade,
        heldOn: params.heldOn,
        createdBy: ctx.userId,
      })
      .onConflictDoNothing({
        target: [
          gradeMeetings.tenantId,
          gradeMeetings.grade,
          gradeMeetings.heldOn,
        ],
      })
      .returning();
    if (inserted) return inserted;

    // すでに誰かがはじめていた (created_by は最初の人のまま)
    const [existing] = await tx
      .select()
      .from(gradeMeetings)
      .where(
        and(
          eq(gradeMeetings.tenantId, ctx.tenantId),
          eq(gradeMeetings.grade, params.grade),
          eq(gradeMeetings.heldOn, params.heldOn),
        ),
      )
      .limit(1);
    return existing;
  }

  // ある会の卓上を全部。古い順 (出した順に積み上がる)。
  async listNotes(
    tx: DrizzleDb,
    meetingId: string,
    ctx: GradeMeetingContext,
  ): Promise<ClassNoteView[]> {
    const rows = await tx
      .select({
        id: classMeetingNotes.id,
        classId: classMeetingNotes.classId,
        kind: classMeetingNotes.kind,
        content: classMeetingNotes.content,
        createdAt: classMeetingNotes.createdAt,
      })
      .from(classMeetingNotes)
      .where(
        and(
          eq(classMeetingNotes.meetingId, meetingId),
          eq(classMeetingNotes.tenantId, ctx.tenantId),
        ),
      )
      .orderBy(asc(classMeetingNotes.createdAt));
    return rows;
  }

  // 前回の「次の一手」だけをクラス別に (今回の冒頭に表示する)。
  // 達成度は採らない — 表示するだけで、触れるかどうかは口頭に委ねる。
  async listActions(
    tx: DrizzleDb,
    meetingId: string,
    ctx: GradeMeetingContext,
  ): Promise<ClassNoteView[]> {
    const rows = await tx
      .select({
        id: classMeetingNotes.id,
        classId: classMeetingNotes.classId,
        kind: classMeetingNotes.kind,
        content: classMeetingNotes.content,
        createdAt: classMeetingNotes.createdAt,
      })
      .from(classMeetingNotes)
      .where(
        and(
          eq(classMeetingNotes.meetingId, meetingId),
          eq(classMeetingNotes.tenantId, ctx.tenantId),
          eq(classMeetingNotes.kind, 'action'),
        ),
      );
    return rows;
  }

  // 観察・状況判断を1行足す (複数行そのまま積む)。
  async addNote(
    tx: DrizzleDb,
    params: {
      meetingId: string;
      classId: string;
      kind: ClassNoteKind;
      content: string;
    },
    ctx: GradeMeetingContext,
  ): Promise<ClassNoteView> {
    const [row] = await tx
      .insert(classMeetingNotes)
      .values({
        tenantId: ctx.tenantId,
        meetingId: params.meetingId,
        classId: params.classId,
        kind: params.kind,
        content: params.content,
        authorUserId: ctx.userId,
      })
      .returning({
        id: classMeetingNotes.id,
        classId: classMeetingNotes.classId,
        kind: classMeetingNotes.kind,
        content: classMeetingNotes.content,
        createdAt: classMeetingNotes.createdAt,
      });
    return row;
  }

  // 「次の一手」を置く。1回×1クラスで1行なので upsert
  // (部分 UNIQUE インデックス class_meeting_notes_action_unique が target)。
  // 書記は誰でもよいので、上書き時に author_user_id を自分に付け替える。
  async upsertAction(
    tx: DrizzleDb,
    params: { meetingId: string; classId: string; content: string },
    ctx: GradeMeetingContext,
  ): Promise<ClassNoteView> {
    const [row] = await tx
      .insert(classMeetingNotes)
      .values({
        tenantId: ctx.tenantId,
        meetingId: params.meetingId,
        classId: params.classId,
        kind: 'action',
        content: params.content,
        authorUserId: ctx.userId,
      })
      .onConflictDoUpdate({
        target: [classMeetingNotes.meetingId, classMeetingNotes.classId],
        targetWhere: sql`kind = 'action'`,
        set: {
          content: params.content,
          authorUserId: ctx.userId,
          updatedAt: sql`now()`,
        },
      })
      .returning({
        id: classMeetingNotes.id,
        classId: classMeetingNotes.classId,
        kind: classMeetingNotes.kind,
        content: classMeetingNotes.content,
        createdAt: classMeetingNotes.createdAt,
      });
    return row;
  }

  // ── 学年の「やること」(実体は既存 tasks) ───────────────────
  // クラスに紐づかない仕事 (行事の準備・学年通信・保護者対応) は学年単位で出る。
  // TODO の仕組みを二重に作らず、tasks に作って中間テーブルで会に紐付ける。

  async listTasks(
    tx: DrizzleDb,
    meetingId: string,
    ctx: GradeMeetingContext,
  ): Promise<GradeTaskView[]> {
    const rows = await tx
      .select({
        taskId: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        status: tasks.status,
        categoryId: tasks.categoryId,
      })
      .from(gradeMeetingTasks)
      .innerJoin(
        tasks,
        and(
          eq(tasks.id, gradeMeetingTasks.taskId),
          eq(tasks.tenantId, gradeMeetingTasks.tenantId),
        ),
      )
      .where(
        and(
          eq(gradeMeetingTasks.meetingId, meetingId),
          eq(gradeMeetingTasks.tenantId, ctx.tenantId),
        ),
      )
      .orderBy(asc(gradeMeetingTasks.createdAt));
    if (rows.length === 0) return [];

    // 担当者をまとめて引いて紐付ける
    const assigneeRows = await tx
      .select({
        taskId: taskAssignees.taskId,
        userId: taskAssignees.userId,
        name: users.name,
      })
      .from(taskAssignees)
      .leftJoin(users, eq(users.id, taskAssignees.userId))
      .where(
        and(
          eq(taskAssignees.tenantId, ctx.tenantId),
          inArray(
            taskAssignees.taskId,
            rows.map((r) => r.taskId),
          ),
        ),
      );

    return rows.map((r) => ({
      ...r,
      dueDate: r.dueDate ? toYmd(r.dueDate) : null,
      assignees: assigneeRows
        .filter((a) => a.taskId === r.taskId)
        .map((a) => ({ userId: a.userId, name: a.name })),
    }));
  }

  // やることを1つ起こす。tasks に作って会に紐付けるまでを1トランザクションで
  // (呼び出し側の withTenantUser の中で実行する)。
  async createTask(
    tx: DrizzleDb,
    params: {
      meetingId: string;
      categoryId: string;
      title: string;
      dueDate?: string;
    },
    ctx: GradeMeetingContext,
  ): Promise<GradeTaskView> {
    const [task] = await tx
      .insert(tasks)
      .values({
        tenantId: ctx.tenantId,
        categoryId: params.categoryId,
        createdBy: ctx.userId,
        title: params.title,
        dueDate: params.dueDate ? new Date(params.dueDate) : null,
        // 既存の新規作成と同じく backlog (未着手) で起こす
        status: 'backlog',
      })
      .returning();

    // 担当は付けない (chimo 2026-08-07)。会議中に人を決めさせない。
    // 付けたくなったらタスクボードから付ける。付いていれば一覧に表示する。
    await tx.insert(gradeMeetingTasks).values({
      tenantId: ctx.tenantId,
      meetingId: params.meetingId,
      taskId: task.id,
    });

    return {
      taskId: task.id,
      title: task.title,
      dueDate: task.dueDate ? toYmd(task.dueDate) : null,
      status: task.status,
      categoryId: task.categoryId,
      assignees: [],
    };
  }

  // 会から「やること」を外す。tasks 本体は残す
  // (タスクタブで生きているものを、学年会の画面から消させない)。
  async unlinkTask(
    tx: DrizzleDb,
    taskId: string,
    meetingId: string,
    ctx: GradeMeetingContext,
  ): Promise<number> {
    const rows = await tx
      .delete(gradeMeetingTasks)
      .where(
        and(
          eq(gradeMeetingTasks.taskId, taskId),
          eq(gradeMeetingTasks.meetingId, meetingId),
          eq(gradeMeetingTasks.tenantId, ctx.tenantId),
        ),
      )
      .returning({ id: gradeMeetingTasks.id });
    return rows.length;
  }

  // 1行引っ込める。観察・判断は本人のみ / 一手は誰でも (RLS の DELETE ポリシーが担保)。
  // 消せなかったときは 0 行が返る = 呼び出し側で 404/403 に翻訳する。
  async deleteNote(
    tx: DrizzleDb,
    id: string,
    ctx: GradeMeetingContext,
  ): Promise<number> {
    const rows = await tx
      .delete(classMeetingNotes)
      .where(
        and(
          eq(classMeetingNotes.id, id),
          eq(classMeetingNotes.tenantId, ctx.tenantId),
        ),
      )
      .returning({ id: classMeetingNotes.id });
    return rows.length;
  }
}

export const gradeMeetingRepo = new GradeMeetingRepository();
