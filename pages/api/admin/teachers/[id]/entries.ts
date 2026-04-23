// Unit-04: GET /api/admin/teachers/[id]/entries — 特定教員の公開エントリ一覧
// 共有投稿（is_public=true）のみ。本文を含む（公開済みデータのため）。
import type { NextApiRequest, NextApiResponse } from 'next';
import { desc, eq, and } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { publicJournalEntries, journalEntryTags, emotionTags } from '@/db/schema';
import type { EmotionTag } from '@/db/schema';
import { teacherIdParamSchema } from '@/features/admin-dashboard/schemas/admin';
import { timelineQuerySchema } from '@/features/journal/schemas/journal';
import { logger } from '@/shared/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (!ctx.roles.includes('school_admin')) {
    return res.status(403).json({ error: 'FORBIDDEN', message: '管理者権限が必要です' });
  }

  const paramParsed = teacherIdParamSchema.safeParse(req.query);
  if (!paramParsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR' });
  }

  const queryParsed = timelineQuerySchema.safeParse(req.query);
  if (!queryParsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR' });
  }

  const { id: teacherId } = paramParsed.data;
  const { page, perPage } = queryParsed.data;
  const offset = (page - 1) * perPage;

  try {
    const entries = await withTenantUser(
      ctx.tenantId, ctx.userId, pickDbRole(ctx),
      async (db) => {
        // public_journal_entries VIEW は is_public=true のみ
        const rows = await db
          .select()
          .from(publicJournalEntries)
          .where(eq(publicJournalEntries.userId, teacherId))
          .orderBy(desc(publicJournalEntries.createdAt))
          .limit(perPage)
          .offset(offset);

        if (rows.length === 0) return [];

        // タグを付与
        const entryIds = rows.map((r) => r.id);
        const { inArray } = await import('drizzle-orm');
        const tagRows = await db
          .select({
            entryId: journalEntryTags.entryId,
            tagId: emotionTags.id,
            tagName: emotionTags.name,
            tagCategory: emotionTags.category,
          })
          .from(journalEntryTags)
          .innerJoin(emotionTags, eq(emotionTags.id, journalEntryTags.tagId))
          .where(inArray(journalEntryTags.entryId, entryIds));

        const tagMap = new Map<string, Array<Pick<EmotionTag, 'id' | 'name' | 'category'>>>();
        for (const row of tagRows) {
          const list = tagMap.get(row.entryId) ?? [];
          list.push({ id: row.tagId, name: row.tagName, category: row.tagCategory });
          tagMap.set(row.entryId, list);
        }

        return rows.map((r) => ({
          id: r.id,
          content: r.content,
          createdAt: r.createdAt.toISOString(),
          tags: tagMap.get(r.id) ?? [],
        }));
      }
    );

    return res.status(200).json({ entries });
  } catch (err) {
    logger.error({ event: 'admin.teacher-entries.error', err, teacherId });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
