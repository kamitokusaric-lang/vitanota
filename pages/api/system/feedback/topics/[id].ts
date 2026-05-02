// 機能 B: system_admin 用 トピック編集 / 削除 API
// PATCH: 部分更新
// DELETE: 投稿数 = 0 のトピックのみ物理削除可、> 0 は 409 (アプリ層で先回りエラー、
//          DB レベルでも FK ON DELETE RESTRICT で物理保護)
// 権限: system_admin のみ
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { getDb } from '@/shared/lib/db';
import { feedbackTopics, feedbackSubmissions } from '@/db/schema';
import { feedbackTopicUpdateSchema } from '@/features/feedback/lib/feedbackSchemas';
import { logger } from '@/shared/lib/logger';

const idParamSchema = z.object({ id: z.string().uuid() });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(req, res, authOptions);

  if (!session || !session.user.roles.includes('system_admin')) {
    return res.status(403).json({ error: 'FORBIDDEN', message: '権限がありません' });
  }

  const idParsed = idParamSchema.safeParse(req.query);
  if (!idParsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'id が不正です' });
  }
  const { id } = idParsed.data;

  if (req.method === 'PATCH') {
    return handleUpdate(req, res, id, session.user.userId);
  }
  if (req.method === 'DELETE') {
    return handleDelete(res, id, session.user.userId);
  }
  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).end();
}

async function handleUpdate(
  req: NextApiRequest,
  res: NextApiResponse,
  id: string,
  adminUserId: string
) {
  const parsed = feedbackTopicUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }

  const patch = parsed.data;
  try {
    const db = await getDb();
    const [updated] = await db
      .update(feedbackTopics)
      .set({
        ...(patch.title !== undefined && { title: patch.title.trim() }),
        ...(patch.description !== undefined && {
          description: patch.description?.trim() || null,
        }),
        ...(patch.sortOrder !== undefined && { sortOrder: patch.sortOrder }),
        ...(patch.isActive !== undefined && { isActive: patch.isActive }),
        updatedAt: new Date(),
      })
      .where(eq(feedbackTopics.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'トピックが見つかりません' });
    }

    logger.info({
      event: 'system.feedback.topic.updated',
      topicId: id,
      adminUserId,
      patch: Object.keys(patch),
    });

    return res.status(200).json({ topic: updated });
  } catch (err) {
    logger.error({ event: 'system.feedback.topics.update.error', err, id });
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '処理中にエラーが発生しました',
    });
  }
}

async function handleDelete(res: NextApiResponse, id: string, adminUserId: string) {
  try {
    const db = await getDb();
    const result = await db.transaction(async (tx) => {
      const [count] = await tx
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(feedbackSubmissions)
        .where(eq(feedbackSubmissions.topicId, id));
      const submissionCount = count?.n ?? 0;

      if (submissionCount > 0) {
        return { kind: 'has_submissions' as const, submissionCount };
      }

      const deleted = await tx
        .delete(feedbackTopics)
        .where(eq(feedbackTopics.id, id))
        .returning({ id: feedbackTopics.id });

      if (deleted.length === 0) {
        return { kind: 'not_found' as const };
      }

      return { kind: 'deleted' as const };
    });

    if (result.kind === 'has_submissions') {
      return res.status(409).json({
        error: 'TOPIC_HAS_SUBMISSIONS',
        message: '投稿があるトピックは削除できません。無効化に切り替えてください',
        submissionCount: result.submissionCount,
      });
    }
    if (result.kind === 'not_found') {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'トピックが見つかりません' });
    }

    logger.info({ event: 'system.feedback.topic.deleted', topicId: id, adminUserId });
    return res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ event: 'system.feedback.topics.delete.error', err, id });
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '処理中にエラーが発生しました',
    });
  }
}
