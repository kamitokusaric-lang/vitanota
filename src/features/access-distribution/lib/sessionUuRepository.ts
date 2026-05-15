// sessions テーブルから UU (ユニーク user_id) を時間帯別 + 期間合計で取得する。
// withSystemAdmin context で query (sessions は RLS 無効、システム集計用)。
import { sql } from 'drizzle-orm';
import { withSystemAdmin } from '@/shared/lib/db';
import { sessions } from '@/db/schema';

export interface UuHourlyRow {
  hour: number;
  uu: number;
}

export async function getUuByHour(
  adminUserId: string,
  startUtc: Date,
  endUtcExclusive: Date,
): Promise<{ hourly: UuHourlyRow[]; totalUu: number }> {
  return withSystemAdmin(adminUserId, async (tx) => {
    // 時間帯別 UU: JST hour で group、user_id distinct
    const hourlyResult = await tx.execute(sql`
      SELECT
        EXTRACT(HOUR FROM ${sessions.lastAccessedAt} AT TIME ZONE 'Asia/Tokyo')::int AS hour,
        COUNT(DISTINCT ${sessions.userId})::int AS uu
      FROM ${sessions}
      WHERE ${sessions.lastAccessedAt} >= ${startUtc}
        AND ${sessions.lastAccessedAt} < ${endUtcExclusive}
        AND ${sessions.userId} IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `);

    // 期間合計 UU
    const totalResult = await tx.execute(sql`
      SELECT COUNT(DISTINCT ${sessions.userId})::int AS total_uu
      FROM ${sessions}
      WHERE ${sessions.lastAccessedAt} >= ${startUtc}
        AND ${sessions.lastAccessedAt} < ${endUtcExclusive}
        AND ${sessions.userId} IS NOT NULL
    `);

    return {
      hourly: hourlyResult.rows as unknown as UuHourlyRow[],
      totalUu:
        (totalResult.rows[0] as unknown as { total_uu: number } | undefined)
          ?.total_uu ?? 0,
    };
  });
}
