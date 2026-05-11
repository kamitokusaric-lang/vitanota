// system_admin 用: タスクカテゴリ編集 + 削除 API
// PATCH: 部分更新 (name / sortOrder / isSystemDefault)
// DELETE: タスクが紐づいていれば moveTo 指定で先に移動 → 削除 (1 トランザクション)
//   moveTo 未指定 + タスク > 0 件 → 409 HAS_TASKS
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { and, eq } from 'drizzle-orm';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { withSystemAdmin } from '@/shared/lib/db';
import { taskCategories, tasks } from '@/db/schema';
import {
  taskCategoryUpdateSchema,
  taskCategoryDeleteSchema,
} from '@/schemas/taskCategory';
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

  const id = req.query.id;
  if (typeof id !== 'string' || id.length === 0) {
    return res.status(400).json({ error: 'INVALID_ID' });
  }

  if (req.method === 'PATCH') {
    return handlePatch(req, res, id, session.user.userId);
  }
  if (req.method === 'DELETE') {
    return handleDelete(req, res, id, session.user.userId);
  }
  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).end();
}

async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse,
  id: string,
  adminUserId: string,
) {
  const parsed = taskCategoryUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }

  try {
    const [updated] = await withSystemAdmin(adminUserId, async (tx) =>
      tx
        .update(taskCategories)
        .set(parsed.data)
        .where(eq(taskCategories.id, id))
        .returning(),
    );

    if (!updated) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    logger.info({
      event: 'admin.task_category.updated',
      categoryId: id,
      adminUserId,
    });
    return res.status(200).json({ category: updated });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return res.status(409).json({
        error: 'NAME_ALREADY_EXISTS',
        message: '同じ名前のカテゴリがすでに存在します',
      });
    }
    logger.error({
      event: 'admin.task_category.update_failed',
      error: String(err),
      categoryId: id,
    });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  id: string,
  adminUserId: string,
) {
  const parsed = taskCategoryDeleteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }
  const moveTo = parsed.data.moveTo ?? null;

  try {
    const deleted = await withSystemAdmin(adminUserId, async (tx) => {
      // 1) 対象カテゴリの存在 + tenant_id 取得 (moveTo 検証に必要)
      const [target] = await tx
        .select({
          id: taskCategories.id,
          tenantId: taskCategories.tenantId,
        })
        .from(taskCategories)
        .where(eq(taskCategories.id, id))
        .limit(1);

      if (!target) {
        return { ok: false as const, code: 'NOT_FOUND' as const };
      }

      // 2) moveTo 指定時は移動先が同テナント内に存在することを確認
      if (moveTo) {
        if (moveTo === id) {
          return { ok: false as const, code: 'SELF_MOVE' as const };
        }
        const [moveTarget] = await tx
          .select({ id: taskCategories.id })
          .from(taskCategories)
          .where(
            and(
              eq(taskCategories.id, moveTo),
              eq(taskCategories.tenantId, target.tenantId),
            ),
          )
          .limit(1);
        if (!moveTarget) {
          return { ok: false as const, code: 'MOVE_TARGET_NOT_FOUND' as const };
        }

        // 3) タスクを移動 (同テナント内のみ、念のため tenant_id 一致)
        await tx
          .update(tasks)
          .set({ categoryId: moveTo })
          .where(
            and(
              eq(tasks.categoryId, id),
              eq(tasks.tenantId, target.tenantId),
            ),
          );
      }

      // 4) カテゴリ削除 (タスクが残ってると FK RESTRICT で例外)
      const rows = await tx
        .delete(taskCategories)
        .where(eq(taskCategories.id, id))
        .returning({ id: taskCategories.id });

      return { ok: true as const, deletedId: rows[0]?.id ?? null };
    });

    if (!deleted.ok) {
      if (deleted.code === 'NOT_FOUND') {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }
      if (deleted.code === 'SELF_MOVE') {
        return res.status(400).json({
          error: 'SELF_MOVE',
          message: '自分自身への移動はできません',
        });
      }
      if (deleted.code === 'MOVE_TARGET_NOT_FOUND') {
        return res.status(400).json({
          error: 'MOVE_TARGET_NOT_FOUND',
          message: '移動先カテゴリが見つかりません',
        });
      }
    }

    logger.info({
      event: 'admin.task_category.deleted',
      categoryId: id,
      moveTo,
      adminUserId,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return res.status(409).json({
        error: 'HAS_TASKS',
        message:
          'タスクが紐づいています。移動先カテゴリ (moveTo) を指定してください',
      });
    }
    logger.error({
      event: 'admin.task_category.delete_failed',
      error: String(err),
      categoryId: id,
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

function isForeignKeyViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23503'
  );
}
