// system_admin 用: タスクタグ一覧取得 + 新規追加 API
// 権限: system_admin のみ
// GET: ?tenantId=... の一覧、各タグの紐づきタスク数 (assignmentCount) も含む
// POST: 新規作成、(tenant_id, name) UNIQUE 違反は 409 NAME_ALREADY_EXISTS
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { asc, eq, sql } from 'drizzle-orm';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { withSystemAdmin } from '@/shared/lib/db';
import { taskTags, taskTagAssignments } from '@/db/schema';
import { taskTagSystemCreateSchema } from '@/features/tasks/schemas/taskTag';
import { logger } from '@/shared/lib/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(req, res, authOptions);

  if (!session || !session.user.roles.includes('system_admin')) {
    return res
      .status(403)
      .json({ error: 'FORBIDDEN', message: '権限がありません' });
  }

  if (req.method === 'GET') {
    return handleList(req, res, session.user.userId);
  }
  if (req.method === 'POST') {
    return handleCreate(req, res, session.user.userId);
  }
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
}

async function handleList(
  req: NextApiRequest,
  res: NextApiResponse,
  adminUserId: string,
) {
  const tenantId = req.query.tenantId;
  if (typeof tenantId !== 'string' || tenantId.length === 0) {
    return res
      .status(400)
      .json({ error: 'INVALID_QUERY', message: 'tenantId が必要です' });
  }

  try {
    const tags = await withSystemAdmin(adminUserId, async (tx) =>
      tx
        .select({
          id: taskTags.id,
          name: taskTags.name,
          createdBy: taskTags.createdBy,
          createdAt: taskTags.createdAt,
          assignmentCount: sql<number>`COUNT(${taskTagAssignments.tagId})::int`,
        })
        .from(taskTags)
        .leftJoin(taskTagAssignments, eq(taskTagAssignments.tagId, taskTags.id))
        .where(eq(taskTags.tenantId, tenantId))
        .groupBy(taskTags.id)
        .orderBy(asc(taskTags.name)),
    );

    return res.status(200).json({ tags });
  } catch (err) {
    logger.error({
      event: 'admin.task_tag.list_failed',
      error: String(err),
      tenantId,
    });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

async function handleCreate(
  req: NextApiRequest,
  res: NextApiResponse,
  adminUserId: string,
) {
  const parsed = taskTagSystemCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }

  const { tenantId, name } = parsed.data;

  try {
    const [tag] = await withSystemAdmin(adminUserId, async (tx) =>
      tx
        .insert(taskTags)
        .values({
          tenantId,
          name,
          createdBy: adminUserId,
        })
        .returning(),
    );

    logger.info({
      event: 'admin.task_tag.created',
      tagId: tag.id,
      tenantId,
      adminUserId,
    });

    return res.status(201).json({ tag: { ...tag, assignmentCount: 0 } });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return res.status(409).json({
        error: 'NAME_ALREADY_EXISTS',
        message: '同じ名前のタグがすでに存在します',
      });
    }
    logger.error({
      event: 'admin.task_tag.create_failed',
      error: String(err),
      tenantId,
    });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}
