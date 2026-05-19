// sessions テーブルから UU (ユニーク user_id) を date×hour matrix + 期間合計で取得する。
// 集計基準: session の created_at (= ログインタイミング)。
// last_accessed_at ベースは「最後にいた時間」しか拾えず、長時間滞在で歪むため不採用。
// withSystemAdmin context で query (sessions は RLS 無効、システム集計用)。
import { sql } from 'drizzle-orm';
import { withSystemAdmin } from '@/shared/lib/db';
import { sessions } from '@/db/schema';
import type { HourDateValue } from './aggregator';

export async function getUuByHourDate(
  adminUserId: string,
  startUtc: Date,
  endUtcExclusive: Date,
): Promise<{ rows: HourDateValue[]; totalUu: number }> {
  return withSystemAdmin(adminUserId, async (tx) => {
    // date × hour 別 UU: created_at の JST date / hour で group、user_id distinct
    const heatmapResult = await tx.execute(sql`
      SELECT
        TO_CHAR(${sessions.createdAt} AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS date,
        EXTRACT(HOUR FROM ${sessions.createdAt} AT TIME ZONE 'Asia/Tokyo')::int AS hour,
        COUNT(DISTINCT ${sessions.userId})::int AS count
      FROM ${sessions}
      WHERE ${sessions.createdAt} >= ${startUtc}
        AND ${sessions.createdAt} < ${endUtcExclusive}
        AND ${sessions.userId} IS NOT NULL
      GROUP BY 1, 2
      ORDER BY 1, 2
    `);

    // 期間合計 UU (distinct user_id)
    const totalResult = await tx.execute(sql`
      SELECT COUNT(DISTINCT ${sessions.userId})::int AS total_uu
      FROM ${sessions}
      WHERE ${sessions.createdAt} >= ${startUtc}
        AND ${sessions.createdAt} < ${endUtcExclusive}
        AND ${sessions.userId} IS NOT NULL
    `);

    return {
      rows: heatmapResult.rows as unknown as HourDateValue[],
      totalUu:
        (totalResult.rows[0] as unknown as { total_uu: number } | undefined)
          ?.total_uu ?? 0,
    };
  });
}
