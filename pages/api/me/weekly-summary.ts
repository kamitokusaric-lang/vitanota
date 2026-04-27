// GET /api/me/weekly-summary - 今週のひとこと (本人のみ)
// その週の summary が DB にあれば返却、なければ AI 生成 + 保存して返却
// 設計書: aidlc-docs/construction/weekly-summary-design.md
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { weeklySummaryService } from '@/features/journal/lib/weeklySummaryService';
import { logger } from '@/shared/lib/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // 個人情報 (本人専用 summary) なのでキャッシュ禁止
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  try {
    // summary (AI 文) と stats (集計数字) を並行で取得
    const [result, stats] = await Promise.all([
      weeklySummaryService.getOrGenerate(ctx),
      weeklySummaryService.getCurrentWeekStats(ctx),
    ]);
    return res.status(200).json({ ...result, stats });
  } catch (err) {
    logger.error({ event: 'me.weekly-summary.get.error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
