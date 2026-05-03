// 機能拡張: タスクタグ一覧 / 作成 API
// 権限: テナント内全員 (chimo 確定: 全教員作成可)
import type { NextApiRequest, NextApiResponse } from 'next';
import { eq, asc, sql } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { taskTags, taskTagAssignments } from '@/db/schema';
import { taskTagCreateSchema } from '@/features/tasks/schemas/taskTag';
import { logger } from '@/shared/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
        // LEFT JOIN + GROUP BY で各タグの利用件数を同梱
        return tx
          .select({
            id: taskTags.id,
            name: taskTags.name,
            createdBy: taskTags.createdBy,
            createdAt: taskTags.createdAt,
            assignmentCount: sql<number>`COUNT(${taskTagAssignments.tagId})::int`,
          })
          .from(taskTags)
          .leftJoin(taskTagAssignments, eq(taskTagAssignments.tagId, taskTags.id))
          .groupBy(taskTags.id)
          .orderBy(asc(taskTags.name));
      },
    );
    return res.status(200).json({ tags });
  } catch (err) {
    logger.error({ event: 'task-tags.list.error', err });
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
  const parsed = taskTagCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '入力が不正です',
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
          .insert(taskTags)
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
    // UNIQUE 制約違反 (tenant_id, name)
    const code = (err as { code?: string })?.code;
    if (code === '23505') {
      return res.status(409).json({
        error: 'TAG_NAME_DUPLICATE',
        message: '同じ名前のタグが既にあります',
      });
    }
    logger.error({ event: 'task-tags.create.error', err });
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '処理中にエラーが発生しました',
    });
  }
}
