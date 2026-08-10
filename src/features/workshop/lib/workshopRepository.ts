// 研修 (workshop) Repository。
// チェックインの upsert / 一覧 (journalComment Repository と同型: join users で著者名付与)。
// 振り返りの紐付け作成 / 一覧は S3 で追加する。
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import {
  workshopCheckins,
  workshopReflections,
  workshopTeamReflections,
  journalEntries,
  users,
} from '@/db/schema';
import type * as schema from '@/db/schema';
import type {
  WorkshopCheckin,
  WorkshopTeamReflection,
  JournalEntry,
} from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export interface WorkshopContext {
  userId: string;
  tenantId: string;
}

// 箱の中に並べる、参加者のチェックイン (著者名付き・匿名化考慮で userName は null 可)。
export type WorkshopCheckinWithUser = {
  id: string;
  userId: string | null;
  userName: string | null;
  answer: string;
  createdAt: Date;
  updatedAt: Date;
};

// 箱の中に並べる、振り返り (紐付いた公開 note の本文 + 著者名)。
export type WorkshopReflectionWithEntry = {
  // journal_entries.id (公開 note の ID。職員室ノートと同一実体)
  journalEntryId: string;
  userId: string | null;
  userName: string | null;
  content: string;
  createdAt: Date;
};

// 箱の中に並べる、チーム振り返り (1班1枚)。
// updatedBy は返さない: 「最後に書いた人」= 入力係を UI に可視化しないため。
export type WorkshopTeamReflectionView = {
  teamKey: string;
  respect: string;
  autonomy: string;
  next: string;
  updatedAt: Date;
};

export interface UpsertTeamReflectionParams {
  workshopId: string;
  teamKey: string;
  respect: string;
  autonomy: string;
  next: string;
}

export class WorkshopRepository {
  // 箱の全チェックイン (テナント内 = 参加者)。RLS が可視範囲を担保。
  async listCheckins(
    tx: DrizzleDb,
    workshopId: string,
    ctx: WorkshopContext,
  ): Promise<WorkshopCheckinWithUser[]> {
    const rows = await tx
      .select({
        id: workshopCheckins.id,
        userId: workshopCheckins.userId,
        userName: users.name,
        answer: workshopCheckins.answer,
        createdAt: workshopCheckins.createdAt,
        updatedAt: workshopCheckins.updatedAt,
      })
      .from(workshopCheckins)
      .leftJoin(users, eq(users.id, workshopCheckins.userId))
      .where(
        and(
          eq(workshopCheckins.workshopId, workshopId),
          eq(workshopCheckins.tenantId, ctx.tenantId),
        ),
      )
      .orderBy(asc(workshopCheckins.createdAt));
    return rows;
  }

  // 自分のチェックインを upsert (1人1回答・上書き)。UNIQUE(workshop_id, user_id)。
  async upsertCheckin(
    tx: DrizzleDb,
    params: { workshopId: string; answer: string },
    ctx: WorkshopContext,
  ): Promise<WorkshopCheckin> {
    const [row] = await tx
      .insert(workshopCheckins)
      .values({
        tenantId: ctx.tenantId,
        workshopId: params.workshopId,
        userId: ctx.userId,
        answer: params.answer,
      })
      .onConflictDoUpdate({
        target: [workshopCheckins.workshopId, workshopCheckins.userId],
        set: { answer: params.answer, updatedAt: sql`now()` },
      })
      .returning();
    return row;
  }

  // 箱の全振り返り。紐付いた journal 本体 (公開 note) の本文と著者名を返す。
  // RLS が可視範囲を担保 (tenant-read)。新しい順。
  async listReflections(
    tx: DrizzleDb,
    workshopId: string,
    ctx: WorkshopContext,
  ): Promise<WorkshopReflectionWithEntry[]> {
    const rows = await tx
      .select({
        journalEntryId: journalEntries.id,
        userId: journalEntries.userId,
        userName: users.name,
        content: journalEntries.content,
        createdAt: journalEntries.createdAt,
      })
      .from(workshopReflections)
      .innerJoin(
        journalEntries,
        and(
          eq(journalEntries.id, workshopReflections.journalEntryId),
          eq(journalEntries.tenantId, workshopReflections.tenantId),
        ),
      )
      .leftJoin(users, eq(users.id, journalEntries.userId))
      .where(
        and(
          eq(workshopReflections.workshopId, workshopId),
          eq(workshopReflections.tenantId, ctx.tenantId),
        ),
      )
      .orderBy(desc(journalEntries.createdAt));
    return rows;
  }

  // 振り返りを投稿: 公開 note (kind='note', is_public=true) を作成し、箱に紐付ける。
  // 呼び出し側 (service) の単一 withTenantUser トランザクション内で実行する。
  // 作成された note は public_journal_entries VIEW 経由で職員室にも自動露出する。
  async createReflection(
    tx: DrizzleDb,
    params: { workshopId: string; content: string },
    ctx: WorkshopContext,
  ): Promise<JournalEntry> {
    const [entry] = await tx
      .insert(journalEntries)
      .values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        content: params.content,
        isPublic: true,
        kind: 'note',
      })
      .returning();

    await tx.insert(workshopReflections).values({
      tenantId: ctx.tenantId,
      workshopId: params.workshopId,
      journalEntryId: entry.id,
    });

    return entry;
  }

  // 箱の全チーム振り返り (テナント内 = 参加者)。RLS が可視範囲を担保。班キー昇順。
  async listTeamReflections(
    tx: DrizzleDb,
    workshopId: string,
    ctx: WorkshopContext,
  ): Promise<WorkshopTeamReflectionView[]> {
    const rows = await tx
      .select({
        teamKey: workshopTeamReflections.teamKey,
        respect: workshopTeamReflections.teamRespect,
        autonomy: workshopTeamReflections.teamAutonomy,
        next: workshopTeamReflections.teamNext,
        updatedAt: workshopTeamReflections.updatedAt,
      })
      .from(workshopTeamReflections)
      .where(
        and(
          eq(workshopTeamReflections.workshopId, workshopId),
          eq(workshopTeamReflections.tenantId, ctx.tenantId),
        ),
      )
      .orderBy(asc(workshopTeamReflections.teamKey));
    return rows;
  }

  // チーム振り返りを upsert (1班1枚・上書き)。
  // UNIQUE(tenant_id, workshop_id, team_key) → チームの誰が書いても同じ1行を更新する。
  // updated_by は常に書いた本人 (RLS の WITH CHECK が要求する)。
  async upsertTeamReflection(
    tx: DrizzleDb,
    params: UpsertTeamReflectionParams,
    ctx: WorkshopContext,
  ): Promise<WorkshopTeamReflection> {
    const [row] = await tx
      .insert(workshopTeamReflections)
      .values({
        tenantId: ctx.tenantId,
        workshopId: params.workshopId,
        teamKey: params.teamKey,
        teamRespect: params.respect,
        teamAutonomy: params.autonomy,
        teamNext: params.next,
        updatedBy: ctx.userId,
      })
      .onConflictDoUpdate({
        target: [
          workshopTeamReflections.tenantId,
          workshopTeamReflections.workshopId,
          workshopTeamReflections.teamKey,
        ],
        set: {
          teamRespect: params.respect,
          teamAutonomy: params.autonomy,
          teamNext: params.next,
          updatedBy: ctx.userId,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    return row;
  }
}

export const workshopRepo = new WorkshopRepository();
