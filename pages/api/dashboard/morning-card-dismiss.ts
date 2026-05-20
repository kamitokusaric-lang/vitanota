// POST /api/dashboard/morning-card-dismiss — 朝カードを今日 dismiss する。
//
// 設計: project_h3_morning_arrival_value
//
// 動作:
//   - user_onboarding_states に context='morning_card', state={dismissedDate: 'YYYY-MM-DD JST'}
//     を UPSERT する
//   - 翌朝以降は dismissedDate < today で再表示 (GET 側で判定)
//
// observed_moment_broken 踏み絵: 「閉じる」は正常動作、 logger.info (warn ではない)

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { userOnboardingStates } from '@/db/schema';
import { logger } from '@/shared/lib/logger';

function getJstDateStr(): string {
  const now = new Date();
  const jstStr = now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' });
  const jstDate = new Date(jstStr);
  const yyyy = jstDate.getFullYear();
  const mm = String(jstDate.getMonth() + 1).padStart(2, '0');
  const dd = String(jstDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const todayStr = getJstDateStr();
  const role = pickDbRole(ctx);

  try {
    await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      await tx
        .insert(userOnboardingStates)
        .values({
          userId: ctx.userId,
          tenantId: ctx.tenantId,
          context: 'morning_card',
          state: { dismissedDate: todayStr },
        })
        .onConflictDoUpdate({
          target: [
            userOnboardingStates.userId,
            userOnboardingStates.tenantId,
            userOnboardingStates.context,
          ],
          set: {
            state: { dismissedDate: todayStr },
            updatedAt: new Date(),
          },
        });
    });

    logger.info({
      event: 'dashboard.morning_card.dismissed',
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      dismissedDate: todayStr,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ event: 'dashboard.morning_card.dismiss_failed', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
