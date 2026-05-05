// 投稿に対するナレッジリアクション (1 ユーザー × 1 投稿、toggle)
//   POST   /api/private/journal/entries/:id/knowledge-reaction → 自分の reaction ON
//   DELETE /api/private/journal/entries/:id/knowledge-reaction → 自分の reaction OFF
//
// 自分の投稿への reaction は 403 (= 「他の人がナレッジと感じた」場合のみ)
import type { NextApiRequest, NextApiResponse } from 'next';
import { and, eq } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { journalEntries, journalKnowledgeReactions } from '@/db/schema';
import { logger } from '@/shared/lib/logger';

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
    return handleAdd(res, ctx, entryId);
  }
  if (req.method === 'DELETE') {
    return handleRemove(res, ctx, entryId);
  }
  res.setHeader('Allow', 'POST, DELETE');
  return res.status(405).end();
}

async function handleAdd(
  res: NextApiResponse,
  ctx: { tenantId: string; userId: string; roles: string[] },
  entryId: string,
) {
  try {
    const result = await withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        // entry の存在 + 自分の投稿でないことを確認
        const [entry] = await tx
          .select({ userId: journalEntries.userId })
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.id, entryId),
              eq(journalEntries.tenantId, ctx.tenantId),
            ),
          );
        if (!entry) return { status: 404 as const };
        if (entry.userId === ctx.userId) return { status: 403 as const };

        // reaction を INSERT (重複は ON CONFLICT で無視)
        await tx
          .insert(journalKnowledgeReactions)
          .values({
            journalEntryId: entryId,
            userId: ctx.userId,
            tenantId: ctx.tenantId,
          })
          .onConflictDoNothing();
        return { status: 201 as const };
      },
    );

    if (result.status === 404) {
      return res.status(404).json({ error: 'ENTRY_NOT_FOUND' });
    }
    if (result.status === 403) {
      return res.status(403).json({
        error: 'CANNOT_REACT_TO_OWN_ENTRY',
        message: '自分の投稿にはリアクションできません',
      });
    }
    return res.status(201).end();
  } catch (err) {
    logger.error({ event: 'knowledge-reaction.add.error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

async function handleRemove(
  res: NextApiResponse,
  ctx: { tenantId: string; userId: string; roles: string[] },
  entryId: string,
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
            ),
          );
      },
    );
    return res.status(204).end();
  } catch (err) {
    logger.error({ event: 'knowledge-reaction.remove.error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
