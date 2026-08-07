// 学年会 (grade-meeting) Service。RLS で権限担保、withTenantUser で境界を張る。
import { withTenantUser } from '@/shared/lib/db';
import { pickDbRole, type AuthContext } from '@/features/journal/lib/apiHelpers';
import {
  gradeMeetingRepo,
  type ClassNoteView,
  type GradeClassView,
  type GradeTaskView,
} from './gradeMeetingRepository';
import type { ClassNoteKind } from '../constants';

export interface GradeMeetingSummary {
  id: string;
  grade: number;
  heldOn: string;
}

export interface GradeMeetingBoardView {
  grade: number;
  // 学年会を開ける学年 (クラスに学年が付いている学年だけ)。UI のチップはこれで作る。
  availableGrades: number[];
  // その学年のクラス (学年未設定のクラスは出ない)。クラス名順で固定。
  classes: GradeClassView[];
  // 今回の会。まだはじめていなければ null (自動では作らない)。
  meeting: GradeMeetingSummary | null;
  // 今回の卓上 (観察 / 状況判断 / 次の一手)。無記名。
  notes: ClassNoteView[];
  // 前回の会と、そこで決めた一手 (今回の冒頭に表示するだけ・達成度は採らない)。
  previousMeeting: GradeMeetingSummary | null;
  previousActions: ClassNoteView[];
  // 学年の「やること」(クラスに紐づかない仕事。実体は既存 tasks)。
  gradeTasks: GradeTaskView[];
}

function toSummary(m: {
  id: string;
  grade: number;
  heldOn: string;
}): GradeMeetingSummary {
  return { id: m.id, grade: m.grade, heldOn: m.heldOn };
}

export class GradeMeetingService {
  // 表示中の週の卓上を取る。その週に会が無ければ meeting=null で、クラスだけ返す。
  // 週をさかのぼれば、その週に開かれた学年会がそのまま出る。
  async getBoard(
    grade: number,
    period: { from: string; to: string },
    ctx: AuthContext,
  ): Promise<GradeMeetingBoardView> {
    return withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        const [classList, meeting, availableGrades] = await Promise.all([
          gradeMeetingRepo.listClassesByGrade(tx, grade, ctx),
          gradeMeetingRepo.findMeetingInRange(tx, grade, period, ctx),
          gradeMeetingRepo.listAvailableGrades(tx, ctx),
        ]);

        if (!meeting) {
          return {
            grade,
            availableGrades,
            classes: classList,
            meeting: null,
            notes: [],
            previousMeeting: null,
            previousActions: [],
            gradeTasks: [],
          };
        }

        const [notes, previous, gradeTasks] = await Promise.all([
          gradeMeetingRepo.listNotes(tx, meeting.id, ctx),
          gradeMeetingRepo.findPreviousMeeting(tx, grade, meeting.heldOn, ctx),
          gradeMeetingRepo.listTasks(tx, meeting.id, ctx),
        ]);
        const previousActions = previous
          ? await gradeMeetingRepo.listActions(tx, previous.id, ctx)
          : [];

        return {
          grade,
          availableGrades,
          classes: classList,
          meeting: toSummary(meeting),
          notes,
          previousMeeting: previous ? toSummary(previous) : null,
          previousActions,
          gradeTasks,
        };
      },
    );
  }

  // 「学年会をはじめる」。同じ学年・同じ日なら既存の会を返す。
  async startMeeting(
    params: { grade: number; heldOn: string },
    ctx: AuthContext,
  ): Promise<GradeMeetingSummary> {
    return withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        const row = await gradeMeetingRepo.startMeeting(tx, params, ctx);
        return toSummary(row);
      },
    );
  }

  // 卓上に1行置く。kind='action' は 1回×1クラスで1行なので upsert。
  async addNote(
    params: {
      meetingId: string;
      classId: string;
      kind: ClassNoteKind;
      content: string;
    },
    ctx: AuthContext,
  ): Promise<ClassNoteView> {
    return withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        if (params.kind === 'action') {
          return gradeMeetingRepo.upsertAction(
            tx,
            {
              meetingId: params.meetingId,
              classId: params.classId,
              content: params.content,
            },
            ctx,
          );
        }
        return gradeMeetingRepo.addNote(tx, params, ctx);
      },
    );
  }

  // 学年の「やること」を1つ起こす。実体は既存 tasks に作り、会に紐付ける。
  // 紐付いたタスクは既存のタスクタブにもそのまま出る。
  async createTask(
    params: {
      meetingId: string;
      categoryId: string;
      title: string;
      dueDate?: string;
    },
    ctx: AuthContext,
  ): Promise<GradeTaskView> {
    return withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => gradeMeetingRepo.createTask(tx, params, ctx),
    );
  }

  // 会から「やること」を外す (tasks 本体は残す)。
  async unlinkTask(
    params: { meetingId: string; taskId: string },
    ctx: AuthContext,
  ): Promise<boolean> {
    return withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        const n = await gradeMeetingRepo.unlinkTask(
          tx,
          params.taskId,
          params.meetingId,
          ctx,
        );
        return n > 0;
      },
    );
  }

  // 1行引っ込める。観察・判断は本人のみ (RLS)。消せなければ false。
  async deleteNote(id: string, ctx: AuthContext): Promise<boolean> {
    return withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        const deleted = await gradeMeetingRepo.deleteNote(tx, id, ctx);
        return deleted > 0;
      },
    );
  }
}

export const gradeMeetingService = new GradeMeetingService();
