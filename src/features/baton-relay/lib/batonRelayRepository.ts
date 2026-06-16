// baton-relay Repository: classes / students / baton_notes / student_reactions の CRUD
// RLS と二重防御で全クエリを tenant_id で絞る。メソッドは (tx, ctx, ...) を受ける。
import { and, eq, desc } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import {
  classes,
  students,
  batonNotes,
  studentReactions,
} from '@/db/schema';
import type * as schema from '@/db/schema';
import type {
  Class,
  Student,
  BatonNote,
  StudentReaction,
} from '@/db/schema';
import type { StudentReactionTypeInput } from '../schemas/batonRelay';

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
    params: { name: string; goalText?: string; schoolYear?: string },
  ): Promise<Class> {
    const [row] = await tx
      .insert(classes)
      .values({
        tenantId: ctx.tenantId,
        name: params.name,
        goalText: params.goalText ?? null,
        schoolYear: params.schoolYear ?? null,
      })
      .returning();
    return row;
  }

  async update(
    tx: DrizzleDb,
    ctx: BatonContext,
    id: string,
    params: { name?: string; goalText?: string | null; schoolYear?: string | null },
  ): Promise<Class | undefined> {
    const patch: Partial<typeof classes.$inferInsert> = { updatedAt: new Date() };
    if (params.name !== undefined) patch.name = params.name;
    if (params.goalText !== undefined) patch.goalText = params.goalText;
    if (params.schoolYear !== undefined) patch.schoolYear = params.schoolYear;
    const [row] = await tx
      .update(classes)
      .set(patch)
      .where(and(eq(classes.id, id), eq(classes.tenantId, ctx.tenantId)))
      .returning();
    return row;
  }
}

// ── students ───────────────────────────────────────────────────
export class StudentRepository {
  // status 省略時は active のみ (日々の記入リスト)。'archived' でアーカイブ済みのみ。
  async findByClass(
    tx: DrizzleDb,
    ctx: BatonContext,
    classId: string,
    status: 'active' | 'archived' = 'active',
  ): Promise<Student[]> {
    return tx
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
    params: { studentId: string; noteDate: string; content: string },
  ): Promise<BatonNote> {
    const [row] = await tx
      .insert(batonNotes)
      .values({
        tenantId: ctx.tenantId,
        studentId: params.studentId,
        authorUserId: ctx.userId,
        noteDate: params.noteDate,
        content: params.content,
      })
      .returning();
    return row;
  }

  async update(
    tx: DrizzleDb,
    ctx: BatonContext,
    id: string,
    content: string,
  ): Promise<BatonNote | undefined> {
    const [row] = await tx
      .update(batonNotes)
      .set({ content, updatedAt: new Date() })
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

// ── student_reactions (印・トグル) ─────────────────────────────
export class StudentReactionRepository {
  async findByClass(
    tx: DrizzleDb,
    ctx: BatonContext,
    classId: string,
  ): Promise<StudentReaction[]> {
    const rows = await tx
      .select({ reaction: studentReactions })
      .from(studentReactions)
      .innerJoin(
        students,
        and(
          eq(students.id, studentReactions.studentId),
          eq(students.tenantId, studentReactions.tenantId),
        ),
      )
      .where(
        and(eq(studentReactions.tenantId, ctx.tenantId), eq(students.classId, classId)),
      );
    return rows.map((r) => r.reaction);
  }

  async findOwn(
    tx: DrizzleDb,
    ctx: BatonContext,
    studentId: string,
    reactionType: StudentReactionTypeInput,
  ): Promise<StudentReaction | undefined> {
    const [row] = await tx
      .select()
      .from(studentReactions)
      .where(
        and(
          eq(studentReactions.tenantId, ctx.tenantId),
          eq(studentReactions.studentId, studentId),
          eq(studentReactions.userId, ctx.userId),
          eq(studentReactions.reactionType, reactionType),
        ),
      )
      .limit(1);
    return row;
  }

  async insert(
    tx: DrizzleDb,
    ctx: BatonContext,
    studentId: string,
    reactionType: StudentReactionTypeInput,
  ): Promise<void> {
    await tx.insert(studentReactions).values({
      tenantId: ctx.tenantId,
      studentId,
      userId: ctx.userId,
      reactionType,
    });
  }

  async deleteOwn(
    tx: DrizzleDb,
    ctx: BatonContext,
    studentId: string,
    reactionType: StudentReactionTypeInput,
  ): Promise<void> {
    await tx
      .delete(studentReactions)
      .where(
        and(
          eq(studentReactions.tenantId, ctx.tenantId),
          eq(studentReactions.studentId, studentId),
          eq(studentReactions.userId, ctx.userId),
          eq(studentReactions.reactionType, reactionType),
        ),
      );
  }
}

export const classRepo = new ClassRepository();
export const studentRepo = new StudentRepository();
export const batonNoteRepo = new BatonNoteRepository();
export const studentReactionRepo = new StudentReactionRepository();
