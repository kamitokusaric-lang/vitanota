// baton-relay Service: 認可コンテキスト (withTenantUser) を張って Repository を呼ぶ
// RLS: teacher / school_admin は自テナント読み書き (相互関心層)。書込は本人の行のみ。
import { withTenantUser } from '@/shared/lib/db';
import { pickDbRole, type AuthContext } from '@/features/journal/lib/apiHelpers';
import {
  classRepo,
  studentRepo,
  batonNoteRepo,
} from './batonRelayRepository';
import type {
  Class,
  Student,
  BatonNote,
} from '@/db/schema';
import type { ImportRow, ImportResult } from '../schemas/batonRelay';
import { planRosterImport } from './rosterImportPlan';

// ── DTO (response 形に整える) ──────────────────────────────────
export interface ClassDto {
  id: string;
  name: string;
  goalText: string | null;
  schoolYear: string | null;
  grade: number | null;
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
  // その子に付いた印象・コメントの件数。**削除確認でだけ使う**。
  // 一覧や学年会に出さない (活動量の可視化にしない・踏み絵)。
  noteCount: number;
  createdAt: string;
  updatedAt: string;
}
export interface BatonNoteDto {
  id: string;
  studentId: string;
  authorUserId: string | null;
  noteDate: string;
  sign: 'good' | 'concern' | null;
  content: string | null;
  createdAt: string;
  updatedAt: string;
}

function toClassDto(c: Class): ClassDto {
  return {
    id: c.id,
    name: c.name,
    goalText: c.goalText,
    schoolYear: c.schoolYear,
    grade: c.grade,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
function toStudentDto(s: Student & { noteCount?: number }): StudentDto {
  return {
    id: s.id,
    classId: s.classId,
    displayName: s.displayName,
    status: s.status,
    enrolledAt: s.enrolledAt,
    leftAt: s.leftAt,
    noteCount: s.noteCount ?? 0,
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
    sign: n.sign,
    content: n.content,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
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
    params: { name: string; goalText?: string; schoolYear?: string; grade?: number },
  ): Promise<ClassDto> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      return toClassDto(await classRepo.create(tx, ctx, params));
    });
  }

  async updateClass(
    ctx: AuthContext,
    id: string,
    params: {
      name?: string;
      goalText?: string | null;
      schoolYear?: string | null;
      grade?: number | null;
    },
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

  // 誤登録の取り消し。在籍終了とは意味が違う (§ repository のコメント)。
  // その子の印象・コメントも cascade で消えるので、UI は件数を見せてから呼ぶ。
  async deleteStudent(ctx: AuthContext, id: string): Promise<boolean> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const n = await studentRepo.delete(tx, ctx, id);
      return n > 0;
    });
  }

  // 選んだ生徒をまとめて操作する。1トランザクションなので、
  // 途中で失敗しても半端に消えたり動いたりしない。
  async bulkStudents(
    ctx: AuthContext,
    params:
      | { action: 'delete'; studentIds: string[] }
      | { action: 'archive'; studentIds: string[] }
      | { action: 'move'; studentIds: string[]; toClassId: string },
  ): Promise<number> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      if (params.action === 'delete') {
        return studentRepo.deleteMany(tx, ctx, params.studentIds);
      }
      if (params.action === 'archive') {
        return studentRepo.updateMany(tx, ctx, params.studentIds, {
          status: 'archived',
          leftAt: new Date().toISOString().slice(0, 10),
        });
      }
      // move: 複合 FK が別テナントの classId を物理的に弾く
      return studentRepo.updateMany(tx, ctx, params.studentIds, {
        classId: params.toClassId,
      });
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
    params: {
      studentId: string;
      noteDate: string;
      sign?: 'good' | 'concern';
      content?: string;
    },
  ): Promise<BatonNoteDto> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      return toNoteDto(await batonNoteRepo.create(tx, ctx, params));
    });
  }

  async updateNote(
    ctx: AuthContext,
    id: string,
    params: { sign?: 'good' | 'concern' | null; content?: string | null },
  ): Promise<BatonNoteDto | null> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const row = await batonNoteRepo.update(tx, ctx, id, params);
      return row ? toNoteDto(row) : null;
    });
  }

  // ── 名簿 CSV 取込 ──
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

      return {
        ...plan.summary,
        sameNameInOtherClasses: plan.sameNameInOtherClasses,
      };
    });
  }

  async deleteNote(ctx: AuthContext, id: string): Promise<boolean> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      return batonNoteRepo.delete(tx, ctx, id);
    });
  }

}

export const batonRelayService = new BatonRelayService();
