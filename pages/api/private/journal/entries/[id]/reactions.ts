// 投稿カードのリアクション 3 種類 (knowledge / appreciation / endorsement) の toggle endpoint
//   POST   /api/private/journal/entries/:id/reactions       body { type } → ON
//   DELETE /api/private/journal/entries/:id/reactions?type=... → OFF
//
// 2026-05-27 (H9 検証):
//   - 既存 knowledge-reaction.ts を generalize、 reaction_type 列に対応
//   - **自分の投稿への reaction も許可** (= セルフ労い動線、 旧 self-block 撤廃)
//   - 1 ユーザー × 1 投稿 × 1 reaction_type で 1 行、 3 種別とも独立 toggle
import type { NextApiRequest, NextApiResponse } from 'next';
import { and, eq } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { journalEntries, journalKnowledgeReactions } from '@/db/schema';
import {
  journalReactionTypeSchema,
  type JournalReactionType,
} from '@/features/journal/schemas/journal';
import { logger } from '@/shared/lib/logger';
import { logEvent, LogEvents } from '@/shared/lib/log-events';
import { BOARD_KINDS } from '@/features/staffroom/lib/staffroomRepository';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const entryId = req.query.id;
  if (typeof entryId !== 'string') {
    return res.status(400).json({ error: 'INVALID_ID' });
  }

  if (req.method === 'POST') {
    const parsed = journalReactionTypeSchema.safeParse(
      (req.body ?? {})?.type,
    );
    if (!parsed.success) {
      return res.status(400).json({ error: 'INVALID_REACTION_TYPE' });
    }
    return handleAdd(res, ctx, entryId, parsed.data);
  }
  if (req.method === 'DELETE') {
    const parsed = journalReactionTypeSchema.safeParse(req.query.type);
    if (!parsed.success) {
      return res.status(400).json({ error: 'INVALID_REACTION_TYPE' });
    }
    return handleRemove(res, ctx, entryId, parsed.data);
  }
  res.setHeader('Allow', 'POST, DELETE');
  return res.status(405).end();
}

async function handleAdd(
  res: NextApiResponse,
  ctx: { tenantId: string; userId: string; roles: string[] },
  entryId: string,
  type: JournalReactionType,
) {
  try {
    const result = await withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        // entry の存在確認のみ (自分の投稿への reaction も許可)
        // kind は staffroom board 投稿のリアクション計測 (循環の「反応する」段階) のため取得。
        const [entry] = await tx
          .select({ id: journalEntries.id, kind: journalEntries.kind })
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.id, entryId),
              eq(journalEntries.tenantId, ctx.tenantId),
            ),
          );
        if (!entry) return { status: 404 as const };

        // reaction を INSERT (重複は ON CONFLICT で無視)
        await tx
          .insert(journalKnowledgeReactions)
          .values({
            journalEntryId: entryId,
            userId: ctx.userId,
            tenantId: ctx.tenantId,
            reactionType: type,
          })
          .onConflictDoNothing();
        return { status: 201 as const, kind: entry.kind };
      },
    );

    if (result.status === 404) {
      return res.status(404).json({ error: 'ENTRY_NOT_FOUND' });
    }
    // H7-B: 職員室ボード投稿へのリアクションだけ循環計測ログを出す (info のみ)
    if ((BOARD_KINDS as readonly string[]).includes(result.kind)) {
      logEvent(LogEvents.StaffroomBoardReacted, {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        boardEntryId: entryId,
        reactionType: type,
      });
    }
    return res.status(201).end();
  } catch (err) {
    logger.error({ event: 'journal-reaction.add.error', err, type });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

async function handleRemove(
  res: NextApiResponse,
  ctx: { tenantId: string; userId: string; roles: string[] },
  entryId: string,
  type: JournalReactionType,
) {
  try {
    await withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        await tx
          .delete(journalKnowledgeReactions)
          .where(
            and(
              eq(journalKnowledgeReactions.journalEntryId, entryId),
              eq(journalKnowledgeReactions.userId, ctx.userId),
              eq(journalKnowledgeReactions.reactionType, type),
            ),
          );
      },
    );
    return res.status(204).end();
  } catch (err) {
    logger.error({ event: 'journal-reaction.remove.error', err, type });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
