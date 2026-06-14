// H7-B 職員室ボード (staffroom) Service
// 認可コンテキスト (withTenantUser) を張って Repository を呼ぶ。
// RLS: board 読みは全教員 (相互関心層)、書きは投稿者本人。comment は 0017 と同型。
// 計測ログ点 (循環の「書く」) を create 時に最初から仕込む (info のみ・観測感を作らない)。
import { withTenantUser } from '@/shared/lib/db';
import { pickDbRole, type AuthContext } from '@/features/journal/lib/apiHelpers';
import { logEvent, LogEvents } from '@/shared/lib/log-events';
import { attachReactions, type Reactions } from '@/features/journal/lib/privateJournalRepository';
import {
  boardRepo,
  studentSupportRepo,
  type SupportClass,
} from './staffroomRepository';
import type { JournalEntry } from '@/db/schema';
import type { StaffroomBoardKindInput, StaffroomBoxKindInput } from '../schemas/staffroom';

// ── DTO ────────────────────────────────────────────────────────
export interface BoardDto {
  id: string;
  boardKind: StaffroomBoxKindInput;
  content: string;
  isPublic: boolean;
  studentId: string | null;
  classId: string | null;
  authorUserId: string | null;
  reactions: Reactions;
  createdAt: string;
  updatedAt: string;
}
// 職員室ボードは「今週分」のみ表示する。JST の今週月曜 00:00 を実 UTC 時刻で返す。
function startOfWeekJst(now: Date): Date {
  const JST = 9 * 60 * 60 * 1000;
  const jst = new Date(now.getTime() + JST); // JST の壁時計を UTC フィールドに写す
  const daysSinceMonday = (jst.getUTCDay() + 6) % 7; // 0=Sun..6=Sat → 月曜からの日数
  const mondayFields = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() - daysSinceMonday);
  return new Date(mondayFields - JST); // JST 月曜 0:00 の実 UTC 時刻
}

// YYYY-MM-DD (JST 日付) の 00:00 JST を実 UTC 時刻で返す (期間フィルタ用)。
function jstDateStartUtc(ymd: string, addDays = 0): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const JST = 9 * 60 * 60 * 1000;
  return new Date(Date.UTC(y, m - 1, d + addDays) - JST);
}

function emptyReactions(): Reactions {
  return {
    knowledge: { count: 0, mine: false },
    appreciation: { count: 0, mine: false },
    endorsement: { count: 0, mine: false },
  };
}

function toBoardDto(e: JournalEntry, reactions: Reactions): BoardDto {
  return {
    id: e.id,
    // findList が表示 6 種で絞っているため kind は box カテゴリのいずれか
    boardKind: e.kind as StaffroomBoxKindInput,
    content: e.content,
    isPublic: e.isPublic,
    studentId: e.studentId,
    classId: e.classId,
    authorUserId: e.userId,
    reactions,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
export class StaffroomService {
  // ── board ──
  async listBoards(
    ctx: AuthContext,
    filter: {
      boardKind?: StaffroomBoxKindInput;
      classId?: string;
      from?: string;
      to?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<BoardDto[]> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      // 投稿日 (created_at) の期間で絞る。from/to 未指定は今週 (chimo 2026-06-14)。
      const since = filter.from ? jstDateStartUtc(filter.from) : startOfWeekJst(new Date());
      const until = filter.to ? jstDateStartUtc(filter.to, 1) : undefined; // 翌日 0:00 未満
      const rows = await boardRepo.findList(tx, ctx, {
        boardKind: filter.boardKind,
        classId: filter.classId,
        limit: filter.limit,
        offset: filter.offset,
        since,
        until,
      });
      const withReactions = await attachReactions(tx, rows, ctx);
      return withReactions.map((r) => toBoardDto(r, r.reactions));
    });
  }

  async createBoard(
    ctx: AuthContext,
    params: {
      boardKind: StaffroomBoardKindInput;
      content: string;
      isPublic?: boolean;
      studentId?: string;
      classId?: string;
    },
  ): Promise<BoardDto> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const row = await boardRepo.create(tx, ctx, params);
      logEvent(LogEvents.StaffroomBoardPosted, {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        boardEntryId: row.id,
        boardKind: params.boardKind,
      });
      // 新規投稿はまだリアクション 0
      return toBoardDto(row, emptyReactions());
    });
  }

  // ── 生徒サポート (A→B seam: 朝バトンをクラス別に集約) ──
  // 一言は from/to の期間で絞る (未指定は今週)。印は現在状態 (chimo 2026-06-14)。
  async getStudentSupport(
    ctx: AuthContext,
    period?: { from?: string; to?: string },
  ): Promise<{ classes: SupportClass[] }> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const since = period?.from ? jstDateStartUtc(period.from) : startOfWeekJst(new Date());
      const until = period?.to ? jstDateStartUtc(period.to, 1) : undefined;
      return studentSupportRepo.get(tx, ctx, since, until);
    });
  }
}

export const staffroomService = new StaffroomService();
