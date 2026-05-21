// US-T-014: 共有タイムライン取得
// /api/public/journal/entries - GET のみ
// SP-U02-04 Layer 1-2: /api/public/* は CloudFront キャッシュ対象
// PP-U02-02: Cache-Control: s-maxage=30, stale-while-revalidate=60
import type { NextApiRequest, NextApiResponse } from 'next';
import { withTenantUser } from '@/shared/lib/db';
import { publicTimelineRepo } from '@/features/journal/lib/publicTimelineRepository';
import { fetchSystemAdminUserIds } from '@/features/journal/lib/aiAuthorLookup';
import { timelineQuerySchema } from '@/features/journal/schemas/journal';
import { requireAuth, pickDbRole, mapErrorToResponse } from '@/features/journal/lib/apiHelpers';
import { LogEvents, logEvent } from '@/shared/lib/log-events';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const parsed = timelineQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '不正なクエリパラメータです',
    });
  }

  const { page, perPage } = parsed.data;
  const offset = (page - 1) * perPage;

  try {
    const entries = await withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      return publicTimelineRepo.findTimeline(
        tx,
        { limit: perPage, offset },
        { tenantId: ctx.tenantId, userId: ctx.userId },
      );
    });

    // isAiPost enrich: 投稿者の中に system_admin 兼任アカウントがあるかを別 trx で判定。
    // 通常 trx (teacher/school_admin RLS) では tenant_id=NULL の system_admin 行が
    // SELECT に出ないため、 withSystemAdmin で 1 回だけ読みに行く。
    const authorUserIds = Array.from(
      new Set(
        entries
          .map((e) => e.userId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const aiUserIds = await fetchSystemAdminUserIds(authorUserIds);
    const enriched = entries.map((e) => ({
      ...e,
      isAiPost: e.userId ? aiUserIds.has(e.userId) : false,
    }));

    // PP-U02-02: エッジキャッシュ対象（CloudFront ホワイトリスト方式）
    // テナント内の教員全員で共有可能なキャッシュ
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=30, stale-while-revalidate=60'
    );

    logEvent(LogEvents.JournalEntryListRead, {
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      endpoint: 'public',
      page,
      count: enriched.length,
    });

    return res.status(200).json({
      entries: enriched,
      page,
      perPage,
    });
  } catch (err) {
    return mapErrorToResponse(err, res, 'public.journal.entries');
  }
}
