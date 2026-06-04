// system_admin 用: 職員室ノート (公開 journal_entries) を CSV エクスポート
// 権限: system_admin のみ。GET のみ。
//
// 重要 (chimo 絶対指示): 公開されている journal だけに絞ること。
// 実装は selectJournalExportRows に切り出し、public_journal_entries VIEW を経由することで
// schema 層で is_public=true を物理的に固定している。
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { withSystemAdmin } from '@/shared/lib/db';
import { logger } from '@/shared/lib/logger';
import { toCsv } from '@/shared/lib/csv';
import {
  selectJournalExportRows,
  journalRowToCsvCells,
  JOURNAL_EXPORT_HEADERS,
} from '@/features/system/lib/journalExportQuery';

const querySchema = z.object({
  tenantId: z.string().guid(),
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
      message: 'tenantId / from (YYYY-MM-DD) / to (YYYY-MM-DD) は必須です',
    });
  }
  const { tenantId, from, to } = parsed.data;

  try {
    const rows = await withSystemAdmin(session.user.userId, async (tx) => {
      return selectJournalExportRows(tx, { tenantId, from, to });
    });

    const body = toCsv(
      [...JOURNAL_EXPORT_HEADERS],
      rows.map(journalRowToCsvCells),
    );

    logger.info({
      event: 'admin.journal_export.fetched',
      tenantId,
      from,
      to,
      rowCount: rows.length,
      requestedBy: session.user.userId,
    });

    const filename = `journal_${tenantId}_${from}_${to}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(body);
  } catch (err) {
    logger.error({ event: 'admin.journal_export.error', err });
    return res
      .status(500)
      .json({ error: 'INTERNAL_ERROR', message: '処理中にエラーが発生しました' });
  }
}
