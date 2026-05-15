// system_admin 用: タスクタグ編集 + 削除 API
// PATCH: 名前変更
// DELETE: タスクが紐づいていれば moveTo 指定で先に付け替え → 削除 (1 トランザクション)
//   moveTo 未指定 + assignment > 0 件 → 409 HAS_TASKS
//   task_tag_assignments PK は (task_id, tag_id) なので、移動先が同タスクに既に付与済の場合は重複回避処理を入れる
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { withSystemAdmin } from '@/shared/lib/db';
import { taskTags, taskTagAssignments } from '@/db/schema';
import {
  taskTagUpdateSchema,
  taskTagDeleteSchema,
} from '@/features/tasks/schemas/taskTag';
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
  const parsed = taskTagUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }

  try {
    const [updated] = await withSystemAdmin(adminUserId, async (tx) =>
      tx
        .update(taskTags)
        .set({ name: parsed.data.name, updatedAt: new Date() })
        .where(eq(taskTags.id, id))
        .returning(),
    );

    if (!updated) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    logger.info({
      event: 'admin.task_tag.updated',
      tagId: id,
      adminUserId,
    });
    return res.status(200).json({ tag: updated });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return res.status(409).json({
        error: 'NAME_ALREADY_EXISTS',
        message: '同じ名前のタグがすでに存在します',
      });
    }
    logger.error({
      event: 'admin.task_tag.update_failed',
      error: String(err),
      tagId: id,
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
  const parsed = taskTagDeleteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }
  const moveTo = parsed.data.moveTo ?? null;

  if (moveTo === id) {
    return res.status(400).json({
      error: 'SELF_MOVE',
      message: '自分自身への移動はできません',
    });
  }

  try {
    const result = await withSystemAdmin(adminUserId, async (tx) => {
      // 1) 対象タグの存在 + tenant_id 取得 (moveTo 検証に必要)
      const [target] = await tx
        .select({
          id: taskTags.id,
          tenantId: taskTags.tenantId,
        })
        .from(taskTags)
        .where(eq(taskTags.id, id))
        .limit(1);

      if (!target) {
        return { kind: 'not_found' as const };
      }

      if (moveTo) {
        // 2) 移動先タグが同テナント内に存在することを確認
        const [moveTarget] = await tx
          .select({ id: taskTags.id })
          .from(taskTags)
          .where(
            and(
              eq(taskTags.id, moveTo),
              eq(taskTags.tenantId, target.tenantId),
            ),
          )
          .limit(1);
        if (!moveTarget) {
          return { kind: 'move_target_not_found' as const };
        }

        // 3) 移動先タグが既に付与されているタスクの assignment は元タグだけ削除
        //    (PK (task_id, tag_id) 衝突回避)
        const overlappingTaskIds = await tx
          .select({ taskId: taskTagAssignments.taskId })
          .from(taskTagAssignments)
          .where(eq(taskTagAssignments.tagId, moveTo));
        const overlappingIds = overlappingTaskIds.map((r) => r.taskId);
        if (overlappingIds.length > 0) {
          await tx
            .delete(taskTagAssignments)
            .where(
              and(
                eq(taskTagAssignments.tagId, id),
                inArray(taskTagAssignments.taskId, overlappingIds),
              ),
            );
        }

        // 4) 残りの assignment を moveTo に付け替え
        await tx
          .update(taskTagAssignments)
          .set({ tagId: moveTo })
          .where(eq(taskTagAssignments.tagId, id));
      } else {
        // moveTo 未指定: 利用中なら 409
        const [count] = await tx
          .select({ n: sql<number>`COUNT(*)::int` })
          .from(taskTagAssignments)
          .where(eq(taskTagAssignments.tagId, id));
        if ((count?.n ?? 0) > 0) {
          return { kind: 'in_use' as const, assignmentCount: count!.n };
        }
      }

      // 5) タグ削除
      await tx.delete(taskTags).where(eq(taskTags.id, id));
      return { kind: 'deleted' as const };
    });

    if (result.kind === 'not_found') {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    if (result.kind === 'move_target_not_found') {
      return res.status(400).json({
        error: 'MOVE_TARGET_NOT_FOUND',
        message: '移動先タグが見つかりません',
      });
    }
    if (result.kind === 'in_use') {
      return res.status(409).json({
        error: 'HAS_TASKS',
        message:
          'タスクが紐づいています。移動先タグ (moveTo) を指定してください',
        assignmentCount: result.assignmentCount,
      });
    }

    logger.info({
      event: 'admin.task_tag.deleted',
      tagId: id,
      moveTo,
      adminUserId,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({
      event: 'admin.task_tag.delete_failed',
      error: String(err),
      tagId: id,
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
