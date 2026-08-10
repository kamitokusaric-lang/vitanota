// baton-relay Repository: classes / students / baton_notes / student_reactions の CRUD
// RLS と二重防御で全クエリを tenant_id で絞る。メソッドは (tx, ctx, ...) を受ける。
import { and, eq, desc, inArray, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import {
  classes,
  students,
  batonNotes,
} from '@/db/schema';
import type * as schema from '@/db/schema';
import type {
  Class,
  Student,
  BatonNote,
} from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export interface BatonContext {
  userId: string;
  tenantId: string;
}

// ── classes ────────────────────────────────────────────────────
export class ClassRepository {
  async findAll(tx: DrizzleDb, ctx: BatonContext): Promise<Class[]> {
    return tx
      .select()
      .from(classes)
      .where(eq(classes.tenantId, ctx.tenantId))
      .orderBy(desc(classes.createdAt));
  }

  async create(
    tx: DrizzleDb,
    ctx: BatonContext,
    params: { name: string; goalText?: string; schoolYear?: string; grade?: number },
  ): Promise<Class> {
    const [row] = await tx
      .insert(classes)
      .values({
        tenantId: ctx.tenantId,
        name: params.name,
        goalText: params.goalText ?? null,
        schoolYear: params.schoolYear ?? null,
        grade: params.grade ?? null,
      })
      .returning();
    return row;
  }

  async update(
    tx: DrizzleDb,
    ctx: BatonContext,
    id: string,
    params: {
      name?: string;
      goalText?: string | null;
      schoolYear?: string | null;
      grade?: number | null;
    },
  ): Promise<Class | undefined> {
    const patch: Partial<typeof classes.$inferInsert> = { updatedAt: new Date() };
    if (params.name !== undefined) patch.name = params.name;
    if (params.goalText !== undefined) patch.goalText = params.goalText;
    if (params.schoolYear !== undefined) patch.schoolYear = params.schoolYear;
    if (params.grade !== undefined) patch.grade = params.grade;
    const [row] = await tx
      .update(classes)
      .set(patch)
      .where(and(eq(classes.id, id), eq(classes.tenantId, ctx.tenantId)))
      .returning();
    return row;
  }
}

// ── students ───────────────────────────────────────────────────
// 生徒 + その子に付いた印象の件数 (削除確認用)。
export type StudentWithNoteCount = Student & { noteCount: number };

export class StudentRepository {
  // status 省略時は active のみ (日々の記入リスト)。'archived' でアーカイブ済みのみ。
  async findByClass(
    tx: DrizzleDb,
    ctx: BatonContext,
    classId: string,
    status: 'active' | 'archived' = 'active',
  ): Promise<StudentWithNoteCount[]> {
    const rows = await tx
      .select()
      .from(students)
      .where(
        and(
          eq(students.tenantId, ctx.tenantId),
          eq(students.classId, classId),
          eq(students.status, status),
        ),
      )
      .orderBy(desc(students.createdAt));
    if (rows.length === 0) return [];

    // 印象・コメントの件数。**削除確認でだけ使う** (一覧や学年会には出さない)。
    // 生徒の活動量を可視化する意図はない (踏み絵)。
    const counts = await tx
      .select({
        studentId: batonNotes.studentId,
        n: sql<number>`count(*)::int`,
      })
      .from(batonNotes)
      .where(
        and(
          eq(batonNotes.tenantId, ctx.tenantId),
          inArray(
            batonNotes.studentId,
            rows.map((r) => r.id),
          ),
        ),
      )
      .groupBy(batonNotes.studentId);
    const byStudent = new Map(counts.map((c) => [c.studentId, c.n]));
    return rows.map((r) => ({ ...r, noteCount: byStudent.get(r.id) ?? 0 }));
  }

  // テナント内の全生徒 (ロスターインポートの重複判定用)
  async findAllByTenant(tx: DrizzleDb, ctx: BatonContext): Promise<Student[]> {
    return tx
      .select()
      .from(students)
      .where(eq(students.tenantId, ctx.tenantId));
  }

  async create(
    tx: DrizzleDb,
    ctx: BatonContext,
    params: {
      classId: string;
      displayName: string;
      enrolledAt?: string;
    },
  ): Promise<Student> {
    const [row] = await tx
      .insert(students)
      .values({
        tenantId: ctx.tenantId,
        classId: params.classId,
        displayName: params.displayName,
        enrolledAt: params.enrolledAt ?? null,
      })
      .returning();
    return row;
  }

  // クラス移動 / 氏名の修正 / アーカイブ・復元。複合 FK で別テナントの classId は物理防止。
  async update(
    tx: DrizzleDb,
    ctx: BatonContext,
    id: string,
    params: {
      classId?: string;
      displayName?: string;
      status?: 'active' | 'archived';
      leftAt?: string | null;
    },
  ): Promise<Student | undefined> {
    const patch: Partial<typeof students.$inferInsert> = {};
    if (params.classId !== undefined) patch.classId = params.classId;
    if (params.displayName !== undefined) patch.displayName = params.displayName;
    if (params.status !== undefined) patch.status = params.status;
    if (params.leftAt !== undefined) patch.leftAt = params.leftAt;
    const [row] = await tx
      .update(students)
      .set(patch)
      .where(and(eq(students.id, id), eq(students.tenantId, ctx.tenantId)))
      .returning();
    return row;
  }

  // 誤登録の取り消し。在籍終了 (archived) とは意味が違う —
  // あちらは転校・卒業という「起きた出来事」、こちらは「そもそも無かったこと」。
  // baton_notes は ON DELETE CASCADE なので、その子の印象・コメントも一緒に消える。
  // 消えないとき (他テナント等) は 0 を返す → 呼び出し側で 404。
  // 一括削除。1トランザクションで全部 or 何も (途中で半端に消えない)。
  async deleteMany(
    tx: DrizzleDb,
    ctx: BatonContext,
    ids: string[],
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const rows = await tx
      .delete(students)
      .where(and(inArray(students.id, ids), eq(students.tenantId, ctx.tenantId)))
      .returning({ id: students.id });
    return rows.length;
  }

  // 一括のクラス移動 / アーカイブ・復元。
  async updateMany(
    tx: DrizzleDb,
    ctx: BatonContext,
    ids: string[],
    params: {
      classId?: string;
      status?: 'active' | 'archived';
      leftAt?: string | null;
    },
  ): Promise<number> {
    if (ids.length === 0) return 0;
    const patch: Partial<typeof students.$inferInsert> = {};
    if (params.classId !== undefined) patch.classId = params.classId;
    if (params.status !== undefined) patch.status = params.status;
    if (params.leftAt !== undefined) patch.leftAt = params.leftAt;
    const rows = await tx
      .update(students)
      .set(patch)
      .where(and(inArray(students.id, ids), eq(students.tenantId, ctx.tenantId)))
      .returning({ id: students.id });
    return rows.length;
  }

  async delete(tx: DrizzleDb, ctx: BatonContext, id: string): Promise<number> {
    const rows = await tx
      .delete(students)
      .where(and(eq(students.id, id), eq(students.tenantId, ctx.tenantId)))
      .returning({ id: students.id });
    return rows.length;
  }
}

// ── baton_notes (append-only) ──────────────────────────────────
export class BatonNoteRepository {
  // クラス内の全生徒の、指定日のノートを返す (生徒横断)
  async findByClassAndDate(
    tx: DrizzleDb,
    ctx: BatonContext,
    classId: string,
    date: string,
  ): Promise<BatonNote[]> {
    const rows = await tx
      .select({ note: batonNotes })
      .from(batonNotes)
      .innerJoin(
        students,
        and(
          eq(students.id, batonNotes.studentId),
          eq(students.tenantId, batonNotes.tenantId),
        ),
      )
      .where(
        and(
          eq(batonNotes.tenantId, ctx.tenantId),
          eq(students.classId, classId),
          eq(batonNotes.noteDate, date),
        ),
      )
      .orderBy(desc(batonNotes.createdAt));
    return rows.map((r) => r.note);
  }

  async create(
    tx: DrizzleDb,
    ctx: BatonContext,
    params: {
      studentId: string;
      noteDate: string;
      sign?: 'good' | 'concern' | null;
      content?: string | null;
    },
  ): Promise<BatonNote> {
    const [row] = await tx
      .insert(batonNotes)
      .values({
        tenantId: ctx.tenantId,
        studentId: params.studentId,
        authorUserId: ctx.userId,
        noteDate: params.noteDate,
        sign: params.sign ?? null,
        content: params.content ?? null,
      })
      .returning();
    return row;
  }

  async update(
    tx: DrizzleDb,
    ctx: BatonContext,
    id: string,
    params: { sign?: 'good' | 'concern' | null; content?: string | null },
  ): Promise<BatonNote | undefined> {
    const [row] = await tx
      .update(batonNotes)
      .set({
        ...(params.sign !== undefined ? { sign: params.sign } : {}),
        ...(params.content !== undefined ? { content: params.content } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(batonNotes.id, id), eq(batonNotes.tenantId, ctx.tenantId)))
      .returning();
    return row;
  }

  async delete(tx: DrizzleDb, ctx: BatonContext, id: string): Promise<boolean> {
    const rows = await tx
      .delete(batonNotes)
      .where(and(eq(batonNotes.id, id), eq(batonNotes.tenantId, ctx.tenantId)))
      .returning({ id: batonNotes.id });
    return rows.length > 0;
  }
}

export const classRepo = new ClassRepository();
export const studentRepo = new StudentRepository();
export const batonNoteRepo = new BatonNoteRepository();
