// system_admin 用: ふりかえり → AIリコメンドの詳細を CSV エクスポート (prompt 改善用)。
// 権限: system_admin のみ。GET のみ。
//
// 全テナント横断・匿名 (user_id / tenant_id は出力しない)。期間 (from/to JST) で絞る。
// input は PII マスク済 (input_masked) のみ。生本文は出さない。reason/awareness/draft を含むため
// system_admin 限定 (ページには個票表示しない)。
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { withSystemAdmin } from '@/shared/lib/db';
import { logger } from '@/shared/lib/logger';
import { toCsv } from '@/shared/lib/csv';
import {
  selectRetroRecommendExportRows,
  retroRecommendRowToCsvCells,
  RETRO_RECOMMEND_EXPORT_HEADERS,
} from '@/features/system/lib/retroRecommendExportQuery';

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(req, res, authOptions);

  if (!session || !session.user.roles.includes('system_admin')) {
    return res.status(403).json({ error: 'FORBIDDEN', message: '権限がありません' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'from (YYYY-MM-DD) / to (YYYY-MM-DD) は必須です',
    });
  }
  const { from, to } = parsed.data;

  try {
    const rows = await withSystemAdmin(session.user.userId, async (tx) => {
      return selectRetroRecommendExportRows(tx, { from, to });
    });

    const body = toCsv(
      [...RETRO_RECOMMEND_EXPORT_HEADERS],
      rows.map(retroRecommendRowToCsvCells),
    );

    logger.info({
      event: 'admin.retro_recommend_export.fetched',
      from,
      to,
      rowCount: rows.length,
      requestedBy: session.user.userId,
    });

    const filename = `retro_recommendations_${from}_${to}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(body);
  } catch (err) {
    logger.error({ event: 'admin.retro_recommend_export.error', err });
    return res
      .status(500)
      .json({ error: 'INTERNAL_ERROR', message: '処理中にエラーが発生しました' });
  }
}
