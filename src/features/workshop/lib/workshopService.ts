// 研修 (workshop) Service。RLS で権限担保、withTenantUser で境界を張る。
// 箱メタは定数 (WORKSHOP)。DB には参加者のチェックインだけ (振り返りは S3)。
import { withTenantUser } from '@/shared/lib/db';
import { pickDbRole, type AuthContext } from '@/features/journal/lib/apiHelpers';
import type {
  WorkshopCheckin,
  WorkshopTeamReflection,
  JournalEntry,
} from '@/db/schema';
import { WORKSHOP, type WorkshopBox } from '../constants';
import type { UpsertTeamReflectionInput } from '../schemas/workshop';
import {
  workshopRepo,
  type WorkshopCheckinWithUser,
  type WorkshopReflectionWithEntry,
  type WorkshopTeamReflectionView,
} from './workshopRepository';

export interface WorkshopBoardView {
  workshop: WorkshopBox;
  // 自分の回答 (入力欄のプリフィル用)。未回答なら null。
  myCheckin: { answer: string; updatedAt: Date } | null;
  // 参加者みんなのチェックイン (箱の中に並ぶ)。
  checkins: WorkshopCheckinWithUser[];
  // 参加者みんなの振り返り (箱の中に並ぶ・職員室にも流れている公開 note)。
  reflections: WorkshopReflectionWithEntry[];
  // チーム振り返り (箱の中だけ。職員室には流さない)。書かれた班のぶんだけ。
  teamReflections: WorkshopTeamReflectionView[];
}

export class WorkshopService {
  // 箱の中身 (箱メタ + 自分の回答 + みんなの回答)。
  async getBoard(ctx: AuthContext): Promise<WorkshopBoardView> {
    return withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        const [checkins, reflections, teamReflections] = await Promise.all([
          workshopRepo.listCheckins(tx, WORKSHOP.id, ctx),
          workshopRepo.listReflections(tx, WORKSHOP.id, ctx),
          workshopRepo.listTeamReflections(tx, WORKSHOP.id, ctx),
        ]);
        const mine = checkins.find((c) => c.userId === ctx.userId);
        return {
          workshop: WORKSHOP,
          myCheckin: mine
            ? { answer: mine.answer, updatedAt: mine.updatedAt }
            : null,
          checkins,
          reflections,
          teamReflections,
        };
      },
    );
  }

  // 自分のチェックインを投稿 (upsert)。
  async submitCheckin(answer: string, ctx: AuthContext): Promise<WorkshopCheckin> {
    return withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        return workshopRepo.upsertCheckin(
          tx,
          { workshopId: WORKSHOP.id, answer },
          ctx,
        );
      },
    );
  }

  // 振り返りを投稿。公開 note 作成 + 箱への紐付けを 1 トランザクションで。
  // 作成された note は職員室ノート/ボードにも自動露出する。
  async postReflection(content: string, ctx: AuthContext): Promise<JournalEntry> {
    return withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        return workshopRepo.createReflection(
          tx,
          { workshopId: WORKSHOP.id, content },
          ctx,
        );
      },
    );
  }

  // チーム振り返りを保存 (upsert)。チームの誰が書いても同じ1枚を更新する。
  // 箱の中に閉じる (journal に乗せない = 職員室には流れない)。
  async upsertTeamReflection(
    input: UpsertTeamReflectionInput,
    ctx: AuthContext,
  ): Promise<WorkshopTeamReflection> {
    return withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        return workshopRepo.upsertTeamReflection(
          tx,
          { workshopId: WORKSHOP.id, ...input },
          ctx,
        );
      },
    );
  }
}

export const workshopService = new WorkshopService();
