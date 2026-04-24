// US-T-014: 共有タイムライン取得
// /api/public/journal/entries - GET のみ
// SP-U02-04 Layer 1-2: /api/public/* は CloudFront キャッシュ対象
// PP-U02-02: Cache-Control: s-maxage=30, stale-while-revalidate=60
import type { NextApiRequest, NextApiResponse } from 'next';
import { withTenantUser } from '@/shared/lib/db';
import { publicTimelineRepo } from '@/features/journal/lib/publicTimelineRepository';
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
      return publicTimelineRepo.findTimeline(tx, { limit: perPage, offset });
    });

    // MVP 期間は投稿の即時反映を優先して CloudFront キャッシュを無効化。
    // 教員数が少ないうち (~数十人/テナント) はキャッシュ効果が限定的で、
    // 投稿→タイムライン更新の体感ラグの方が UX を損ねるため。
    res.setHeader('Cache-Control', 'private, no-store');

    logEvent(LogEvents.JournalEntryListRead, {
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      endpoint: 'public',
      page,
      count: entries.length,
    });

    return res.status(200).json({
      entries,
      page,
      perPage,
    });
  } catch (err) {
    return mapErrorToResponse(err, res, 'public.journal.entries');
  }
}
