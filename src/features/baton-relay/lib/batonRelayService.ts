// baton-relay Service: 認可コンテキスト (withTenantUser) を張って Repository を呼ぶ
// RLS: teacher / school_admin は自テナント読み書き (相互関心層)。書込は本人の行のみ。
import { withTenantUser } from '@/shared/lib/db';
import { pickDbRole, type AuthContext } from '@/features/journal/lib/apiHelpers';
import {
  classRepo,
  studentRepo,
  batonNoteRepo,
  studentReactionRepo,
} from './batonRelayRepository';
import type {
  Class,
  Student,
  BatonNote,
  StudentReaction,
} from '@/db/schema';
import type { StudentReactionTypeInput, ImportRow, ImportResult } from '../schemas/batonRelay';
import { planRosterImport } from './rosterImportPlan';

// ── DTO (response 形に整える) ──────────────────────────────────
export interface ClassDto {
  id: string;
  name: string;
  goalText: string | null;
  schoolYear: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface StudentDto {
  id: string;
  classId: string;
  displayName: string;
  status: 'active' | 'archived';
  enrolledAt: string | null;
  leftAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface BatonNoteDto {
  id: string;
  studentId: string;
  authorUserId: string | null;
  noteDate: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
export interface StudentReactionDto {
  id: string;
  studentId: string;
  userId: string;
  reactionType: 'positive' | 'concern';
  createdAt: string;
}

function toClassDto(c: Class): ClassDto {
  return {
    id: c.id,
    name: c.name,
    goalText: c.goalText,
    schoolYear: c.schoolYear,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
function toStudentDto(s: Student): StudentDto {
  return {
    id: s.id,
    classId: s.classId,
    displayName: s.displayName,
    status: s.status,
    enrolledAt: s.enrolledAt,
    leftAt: s.leftAt,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}
function toNoteDto(n: BatonNote): BatonNoteDto {
  return {
    id: n.id,
    studentId: n.studentId,
    authorUserId: n.authorUserId,
    noteDate: n.noteDate,
    content: n.content,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}
function toReactionDto(r: StudentReaction): StudentReactionDto {
  return {
    id: r.id,
    studentId: r.studentId,
    userId: r.userId,
    reactionType: r.reactionType,
    createdAt: r.createdAt.toISOString(),
  };
}

export class BatonRelayService {
  // ── classes ──
  async listClasses(ctx: AuthContext): Promise<ClassDto[]> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const rows = await classRepo.findAll(tx, ctx);
      return rows.map(toClassDto);
    });
  }

  async createClass(
    ctx: AuthContext,
    params: { name: string; goalText?: string; schoolYear?: string },
  ): Promise<ClassDto> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      return toClassDto(await classRepo.create(tx, ctx, params));
    });
  }

  async updateClass(
    ctx: AuthContext,
    id: string,
    params: { name?: string; goalText?: string | null; schoolYear?: string | null },
  ): Promise<ClassDto | null> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const row = await classRepo.update(tx, ctx, id, params);
      return row ? toClassDto(row) : null;
    });
  }

  // ── students ──
  async listStudents(
    ctx: AuthContext,
    classId: string,
    status: 'active' | 'archived' = 'active',
  ): Promise<StudentDto[]> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const rows = await studentRepo.findByClass(tx, ctx, classId, status);
      return rows.map(toStudentDto);
    });
  }

  async createStudent(
    ctx: AuthContext,
    params: {
      classId: string;
      displayName: string;
      enrolledAt?: string;
    },
  ): Promise<StudentDto> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      return toStudentDto(await studentRepo.create(tx, ctx, params));
    });
  }

  // クラス移動 / 氏名修正 / アーカイブ・復元 (chimo 2026-06-14)。
  // status 指定時は left_at をサーバが導出 (archived=今日 / active=null)。
  async updateStudent(
    ctx: AuthContext,
    id: string,
    params: { classId?: string; displayName?: string; status?: 'active' | 'archived' },
  ): Promise<StudentDto | null> {
    const leftAt =
      params.status === undefined
        ? undefined
        : params.status === 'archived'
          ? new Date().toISOString().slice(0, 10)
          : null;
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const row = await studentRepo.update(tx, ctx, id, { ...params, leftAt });
      return row ? toStudentDto(row) : null;
    });
  }

  // ── baton_notes ──
  async listNotes(
    ctx: AuthContext,
    classId: string,
    date: string,
  ): Promise<BatonNoteDto[]> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const rows = await batonNoteRepo.findByClassAndDate(tx, ctx, classId, date);
      return rows.map(toNoteDto);
    });
  }

  async createNote(
    ctx: AuthContext,
    params: { studentId: string; noteDate: string; content: string },
  ): Promise<BatonNoteDto> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      return toNoteDto(await batonNoteRepo.create(tx, ctx, params));
    });
  }

  async updateNote(
    ctx: AuthContext,
    id: string,
    content: string,
  ): Promise<BatonNoteDto | null> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const row = await batonNoteRepo.update(tx, ctx, id, content);
      return row ? toNoteDto(row) : null;
    });
  }

  async deleteNote(ctx: AuthContext, id: string): Promise<boolean> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      return batonNoteRepo.delete(tx, ctx, id);
    });
  }

  // ── student_reactions (トグル) ──
  async listReactions(
    ctx: AuthContext,
    classId: string,
  ): Promise<StudentReactionDto[]> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const rows = await studentReactionRepo.findByClass(tx, ctx, classId);
      return rows.map(toReactionDto);
    });
  }

  // 付与/解除のトグル。付与後の状態 (active) を返す。
  async toggleReaction(
    ctx: AuthContext,
    studentId: string,
    reactionType: StudentReactionTypeInput,
  ): Promise<{ active: boolean }> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const existing = await studentReactionRepo.findOwn(tx, ctx, studentId, reactionType);
      if (existing) {
        await studentReactionRepo.deleteOwn(tx, ctx, studentId, reactionType);
        return { active: false };
      }
      await studentReactionRepo.insert(tx, ctx, studentId, reactionType);
      return { active: true };
    });
  }

  // ロスター CSV インポート (冪等)。1 トランザクションで既存を読み → 差分計算 → 適用。
  async importRoster(ctx: AuthContext, rows: ImportRow[]): Promise<ImportResult> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const existingClasses = await classRepo.findAll(tx, ctx);
      const existingStudents = await studentRepo.findAllByTenant(tx, ctx);

      const plan = planRosterImport(
        rows,
        existingClasses.map((c) => ({ id: c.id, name: c.name, goalText: c.goalText })),
        existingStudents.map((s) => ({ classId: s.classId, displayName: s.displayName })),
      );

      // クラス名 → id (既存 + 新規作成)
      const classIdByName = new Map<string, string>();
      for (const c of existingClasses) classIdByName.set(c.name, c.id);
      for (const c of plan.classesToCreate) {
        const created = await classRepo.create(tx, ctx, {
          name: c.name,
          goalText: c.goalText ?? undefined,
        });
        classIdByName.set(created.name, created.id);
      }
      for (const g of plan.goalsToUpdate) {
        await classRepo.update(tx, ctx, g.id, { goalText: g.goalText });
      }
      for (const s of plan.studentsToAdd) {
        const classId = classIdByName.get(s.className);
        if (!classId) continue; // 通常起こらない (上で作成済み)
        await studentRepo.create(tx, ctx, {
          classId,
          displayName: s.displayName,
        });
      }

      return plan.summary;
    });
  }
}

export const batonRelayService = new BatonRelayService();
