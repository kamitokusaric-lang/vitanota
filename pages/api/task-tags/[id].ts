// 機能拡張: タスクタグ削除 API
// 利用中タグ (= task_tag_assignments に行あり) は 409、未使用は物理削除
// FK ON DELETE RESTRICT が DB レベル保護として二重で効く
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { taskTags, taskTagAssignments } from '@/db/schema';
import { logger } from '@/shared/lib/logger';

const idParamSchema = z.object({ id: z.string().uuid() });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).end();
  }

  const parsed = idParamSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'id が不正です' });
  }
  const { id } = parsed.data;

  try {
    const result = await withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        const [count] = await tx
          .select({ n: sql<number>`COUNT(*)::int` })
          .from(taskTagAssignments)
          .where(eq(taskTagAssignments.tagId, id));
        const assignmentCount = count?.n ?? 0;
        if (assignmentCount > 0) {
          return { kind: 'in_use' as const, assignmentCount };
        }

        const deleted = await tx
          .delete(taskTags)
          .where(eq(taskTags.id, id))
          .returning({ id: taskTags.id });
        if (deleted.length === 0) {
          return { kind: 'not_found' as const };
        }
        return { kind: 'deleted' as const };
      },
    );

    if (result.kind === 'in_use') {
      return res.status(409).json({
        error: 'TAG_IN_USE',
        message: '使用中のタグは削除できません。先にタスクから外してください',
        assignmentCount: result.assignmentCount,
      });
    }
    if (result.kind === 'not_found') {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'タグが見つかりません' });
    }

    logger.info({ event: 'task-tags.deleted', tagId: id, userId: ctx.userId });
    return res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ event: 'task-tags.delete.error', err, id });
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '処理中にエラーが発生しました',
    });
  }
}
