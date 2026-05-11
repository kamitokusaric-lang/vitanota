// system_admin 用: お知らせの編集 + 削除
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { eq } from 'drizzle-orm';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { withSystemAdmin } from '@/shared/lib/db';
import { announcements } from '@/db/schema';
import { announcementUpdateSchema } from '@/schemas/announcement';
import type { AnnouncementDTO } from '@/schemas/announcement';
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
    return handleDelete(res, id, session.user.userId);
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
  const parsed = announcementUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }

  const updateValues: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.publishDate !== undefined)
    updateValues.publishDate = parsed.data.publishDate;
  if (parsed.data.title !== undefined)
    updateValues.title = parsed.data.title.trim();
  if (parsed.data.body !== undefined) updateValues.body = parsed.data.body;

  try {
    const [updated] = await withSystemAdmin(adminUserId, async (tx) =>
      tx
        .update(announcements)
        .set(updateValues)
        .where(eq(announcements.id, id))
        .returning(),
    );

    if (!updated) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    logger.info({
      event: 'admin.announcements.updated',
      announcementId: id,
      adminUserId,
    });

    const dto: AnnouncementDTO = {
      id: updated.id,
      publishDate: updated.publishDate,
      title: updated.title,
      body: Array.isArray(updated.body) ? (updated.body as string[]) : [],
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    return res.status(200).json({ announcement: dto });
  } catch (err) {
    logger.error({
      event: 'admin.announcements.update_failed',
      error: String(err),
      announcementId: id,
    });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

async function handleDelete(
  res: NextApiResponse,
  id: string,
  adminUserId: string,
) {
  try {
    const deleted = await withSystemAdmin(adminUserId, async (tx) =>
      tx
        .delete(announcements)
        .where(eq(announcements.id, id))
        .returning({ id: announcements.id }),
    );

    if (deleted.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    logger.info({
      event: 'admin.announcements.deleted',
      announcementId: id,
      adminUserId,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({
      event: 'admin.announcements.delete_failed',
      error: String(err),
      announcementId: id,
    });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
