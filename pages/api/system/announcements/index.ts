// system_admin 用: 開発者からのお知らせ 一覧 + 新規追加
// 権限: system_admin only
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { desc } from 'drizzle-orm';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { withSystemAdmin } from '@/shared/lib/db';
import { announcements } from '@/db/schema';
import { announcementCreateSchema } from '@/schemas/announcement';
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

  if (req.method === 'GET') {
    return handleList(res, session.user.userId);
  }
  if (req.method === 'POST') {
    return handleCreate(req, res, session.user.userId);
  }
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
}

async function handleList(res: NextApiResponse, adminUserId: string) {
  try {
    const rows = await withSystemAdmin(adminUserId, async (tx) =>
      tx
        .select()
        .from(announcements)
        .orderBy(desc(announcements.publishDate), desc(announcements.createdAt)),
    );

    const result: AnnouncementDTO[] = rows.map((r) => ({
      id: r.id,
      publishDate: r.publishDate,
      title: r.title,
      body: Array.isArray(r.body) ? (r.body as string[]) : [],
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return res.status(200).json({ announcements: result });
  } catch (err) {
    logger.error({
      event: 'admin.announcements.list_failed',
      error: String(err),
    });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

async function handleCreate(
  req: NextApiRequest,
  res: NextApiResponse,
  adminUserId: string,
) {
  const parsed = announcementCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }

  const { publishDate, title, body } = parsed.data;

  try {
    const [created] = await withSystemAdmin(adminUserId, async (tx) =>
      tx
        .insert(announcements)
        .values({
          publishDate,
          title: title.trim(),
          body,
        })
        .returning(),
    );

    logger.info({
      event: 'admin.announcements.created',
      announcementId: created.id,
      adminUserId,
    });

    const dto: AnnouncementDTO = {
      id: created.id,
      publishDate: created.publishDate,
      title: created.title,
      body: Array.isArray(created.body) ? (created.body as string[]) : [],
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };

    return res.status(201).json({ announcement: dto });
  } catch (err) {
    logger.error({
      event: 'admin.announcements.create_failed',
      error: String(err),
    });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
