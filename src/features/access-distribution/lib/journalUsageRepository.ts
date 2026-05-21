// journal_entries テーブルから件数を date×hour matrix で取得する。
// 集計基準: journal_entries.created_at の JST date×hour、 合算件数 + 非公開件数 (is_public=false)。
// withSystemAdmin context で query (集計用途、 RLS bypass)。
import { sql } from 'drizzle-orm';
import { withSystemAdmin } from '@/shared/lib/db';
import { journalEntries } from '@/db/schema';
import type { DateCountValue, HourDateValueWithSub } from './aggregator';

export async function getJournalUsageByHourDate(
  adminUserId: string,
  startUtc: Date,
  endUtcExclusive: Date,
): Promise<{
  rows: HourDateValueWithSub[];
  totalEntries: number;
  totalPrivateEntries: number;
}> {
  return withSystemAdmin(adminUserId, async (tx) => {
    const heatmapResult = await tx.execute(sql`
      SELECT
        TO_CHAR(${journalEntries.createdAt} AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS date,
        EXTRACT(HOUR FROM ${journalEntries.createdAt} AT TIME ZONE 'Asia/Tokyo')::int AS hour,
        COUNT(*)::int AS count,
        COUNT(*) FILTER (WHERE ${journalEntries.isPublic} = false)::int AS sub_count
      FROM ${journalEntries}
      WHERE ${journalEntries.createdAt} >= ${startUtc}
        AND ${journalEntries.createdAt} < ${endUtcExclusive}
      GROUP BY 1, 2
      ORDER BY 1, 2
    `);

    const totalResult = await tx.execute(sql`
      SELECT
        COUNT(*)::int AS total_entries,
        COUNT(*) FILTER (WHERE ${journalEntries.isPublic} = false)::int AS total_private
      FROM ${journalEntries}
      WHERE ${journalEntries.createdAt} >= ${startUtc}
        AND ${journalEntries.createdAt} < ${endUtcExclusive}
    `);

    const totals = totalResult.rows[0] as unknown as
      | { total_entries: number; total_private: number }
      | undefined;

    return {
      rows: (heatmapResult.rows as unknown as Array<{
        date: string;
        hour: number;
        count: number;
        sub_count: number;
      }>).map((r) => ({
        date: r.date,
        hour: r.hour,
        count: r.count,
        subCount: r.sub_count,
      })),
      totalEntries: totals?.total_entries ?? 0,
      totalPrivateEntries: totals?.total_private ?? 0,
    };
  });
}

// 日次 journal_entries 合算件数 (折れ線グラフ用)。
// 折れ線は合算のみ。非公開件数 (sub) はヒートマップ側で確認する。
export async function getDailyJournalEntries(
  adminUserId: string,
  startUtc: Date,
  endUtcExclusive: Date,
): Promise<DateCountValue[]> {
  return withSystemAdmin(adminUserId, async (tx) => {
    const result = await tx.execute(sql`
      SELECT
        TO_CHAR(${journalEntries.createdAt} AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS count
      FROM ${journalEntries}
      WHERE ${journalEntries.createdAt} >= ${startUtc}
        AND ${journalEntries.createdAt} < ${endUtcExclusive}
      GROUP BY 1
      ORDER BY 1
    `);
    return result.rows as unknown as DateCountValue[];
  });
}
