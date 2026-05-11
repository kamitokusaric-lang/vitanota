// 教員向け: 開発者からのお知らせ一覧取得 (read only)
// 全テナント共通、認証済み (teacher / school_admin / system_admin) 全ロール可
// RLS の announcements_read ポリシーで保護
import type { NextApiRequest, NextApiResponse } from 'next';
import { desc } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { announcements } from '@/db/schema';
import type { AnnouncementDTO } from '@/schemas/announcement';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  try {
    const rows = await withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) =>
        tx
          .select()
          .from(announcements)
          .orderBy(desc(announcements.publishDate), desc(announcements.createdAt)),
    );

    const announcementsResponse: AnnouncementDTO[] = rows.map((r) => ({
      id: r.id,
      publishDate: r.publishDate,
      title: r.title,
      body: Array.isArray(r.body) ? (r.body as string[]) : [],
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return res.status(200).json({ announcements: announcementsResponse });
  } catch (_err) {
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
