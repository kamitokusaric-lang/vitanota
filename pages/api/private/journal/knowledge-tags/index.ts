// ナレッジタグ一覧 / 作成 API (task-tags と同パターン)
// 権限: テナント内全員 (task_tags と同じく全教員作成可)
import type { NextApiRequest, NextApiResponse } from 'next';
import { eq, asc, sql } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { knowledgeTags, journalEntryKnowledgeTags } from '@/db/schema';
import { knowledgeTagCreateSchema } from '@/features/journal/schemas/knowledgeTag';
import { logger } from '@/shared/lib/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method === 'GET') {
    return handleList(res, ctx);
  }
  if (req.method === 'POST') {
    return handleCreate(req, res, ctx);
  }
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
}

async function handleList(
  res: NextApiResponse,
  ctx: { tenantId: string; userId: string; roles: string[] },
) {
  try {
    const tags = await withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        return tx
          .select({
            id: knowledgeTags.id,
            name: knowledgeTags.name,
            createdBy: knowledgeTags.createdBy,
            createdAt: knowledgeTags.createdAt,
            assignmentCount: sql<number>`COUNT(${journalEntryKnowledgeTags.knowledgeTagId})::int`,
          })
          .from(knowledgeTags)
          .leftJoin(
            journalEntryKnowledgeTags,
            eq(journalEntryKnowledgeTags.knowledgeTagId, knowledgeTags.id),
          )
          .groupBy(knowledgeTags.id)
          .orderBy(asc(knowledgeTags.name));
      },
    );
    return res.status(200).json({ tags });
  } catch (err) {
    logger.error({ event: 'knowledge-tags.list.error', err });
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '処理中にエラーが発生しました',
    });
  }
}

async function handleCreate(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: { tenantId: string; userId: string; roles: string[] },
) {
  const parsed = knowledgeTagCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message ?? '入力が不正です',
    });
  }
  const { name } = parsed.data;
  try {
    const tag = await withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        const [created] = await tx
          .insert(knowledgeTags)
          .values({
            tenantId: ctx.tenantId,
            name: name.trim(),
            createdBy: ctx.userId,
          })
          .returning();
        return created;
      },
    );
    return res.status(201).json({ tag: { ...tag, assignmentCount: 0 } });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === '23505') {
      return res.status(409).json({
        error: 'TAG_NAME_DUPLICATE',
        message: '同じ名前のタグが既にあります',
      });
    }
    logger.error({ event: 'knowledge-tags.create.error', err });
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '処理中にエラーが発生しました',
    });
  }
}
