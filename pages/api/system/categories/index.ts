// system_admin 用: タスクカテゴリ一覧取得 + 新規追加 API
// 権限: system_admin のみ
// GET: ?tenantId=... の一覧、各カテゴリの紐づきタスク数 (taskCount) も含む
// POST: 新規作成、(tenant_id, name) UNIQUE 違反は 409 NAME_ALREADY_EXISTS
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { withSystemAdmin } from '@/shared/lib/db';
import { taskCategories, tasks } from '@/db/schema';
import { taskCategoryCreateSchema } from '@/schemas/taskCategory';
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
    const categories = await withSystemAdmin(adminUserId, async (tx) =>
      tx
        .select({
          id: taskCategories.id,
          name: taskCategories.name,
          isSystemDefault: taskCategories.isSystemDefault,
          sortOrder: taskCategories.sortOrder,
          createdAt: taskCategories.createdAt,
          // Done (完了) タスクは紐付き数に含めない (chimo 2026-05-30)。
          // 条件は ON 句に置き、 LEFT JOIN で非 Done が 0 のカテゴリも 0 件として残す。
          taskCount: sql<number>`COUNT(${tasks.id})::int`,
        })
        .from(taskCategories)
        .leftJoin(
          tasks,
          and(
            eq(tasks.categoryId, taskCategories.id),
            eq(tasks.tenantId, taskCategories.tenantId),
            ne(tasks.status, 'done'),
          ),
        )
        .where(eq(taskCategories.tenantId, tenantId))
        .groupBy(taskCategories.id)
        .orderBy(asc(taskCategories.sortOrder), asc(taskCategories.createdAt)),
    );

    return res.status(200).json({ categories });
  } catch (err) {
    logger.error({
      event: 'admin.task_category.list_failed',
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
  const parsed = taskCategoryCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message ?? '入力が不正です',
    });
  }

  const { tenantId, name, sortOrder, isSystemDefault } = parsed.data;

  try {
    const [category] = await withSystemAdmin(adminUserId, async (tx) =>
      tx
        .insert(taskCategories)
        .values({
          tenantId,
          name,
          sortOrder,
          isSystemDefault,
          createdBy: adminUserId,
        })
        .returning(),
    );

    logger.info({
      event: 'admin.task_category.created',
      categoryId: category.id,
      tenantId,
      adminUserId,
    });

    return res.status(201).json({ category });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return res.status(409).json({
        error: 'NAME_ALREADY_EXISTS',
        message: '同じ名前のカテゴリがすでに存在します',
      });
    }
    logger.error({
      event: 'admin.task_category.create_failed',
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
