// tasks テーブルから操作 + 完了件数を date×hour matrix で取得する。
// main: tasks.updated_at の JST date×hour 件数 (= create + update を含む「最後に touch した」 件数)
// sub:  tasks.completed_at の JST date×hour 件数 (= 完了マークが立った時刻)
//
// 罠: 同じ row が複数 hour で update された場合、 updated_at は上書きされるため最新 hour にしか
// カウントされない。 vitanota β 期間ではタスク件数少なく問題にならないが、 仕様として明示。
//
// withSystemAdmin context で query (集計用途、 RLS bypass)。
import { sql } from 'drizzle-orm';
import { withSystemAdmin } from '@/shared/lib/db';
import { tasks } from '@/db/schema';
import type { HourDateValueWithSub } from './aggregator';

export async function getTaskUsageByHourDate(
  adminUserId: string,
  startUtc: Date,
  endUtcExclusive: Date,
): Promise<{
  rows: HourDateValueWithSub[];
  totalTouches: number;
  totalCompletes: number;
}> {
  return withSystemAdmin(adminUserId, async (tx) => {
    // touches (updated_at) と completes (completed_at) を FULL OUTER JOIN で
    // 1 つの (date, hour) row に集約する
    const heatmapResult = await tx.execute(sql`
      WITH touches AS (
        SELECT
          TO_CHAR(${tasks.updatedAt} AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS date,
          EXTRACT(HOUR FROM ${tasks.updatedAt} AT TIME ZONE 'Asia/Tokyo')::int AS hour,
          COUNT(*)::int AS touch_count
        FROM ${tasks}
        WHERE ${tasks.updatedAt} >= ${startUtc}
          AND ${tasks.updatedAt} < ${endUtcExclusive}
        GROUP BY 1, 2
      ),
      completions AS (
        SELECT
          TO_CHAR(${tasks.completedAt} AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS date,
          EXTRACT(HOUR FROM ${tasks.completedAt} AT TIME ZONE 'Asia/Tokyo')::int AS hour,
          COUNT(*)::int AS complete_count
        FROM ${tasks}
        WHERE ${tasks.completedAt} IS NOT NULL
          AND ${tasks.completedAt} >= ${startUtc}
          AND ${tasks.completedAt} < ${endUtcExclusive}
        GROUP BY 1, 2
      )
      SELECT
        COALESCE(t.date, c.date) AS date,
        COALESCE(t.hour, c.hour) AS hour,
        COALESCE(t.touch_count, 0) AS count,
        COALESCE(c.complete_count, 0) AS sub_count
      FROM touches t
      FULL OUTER JOIN completions c ON t.date = c.date AND t.hour = c.hour
      ORDER BY 1, 2
    `);

    const totalResult = await tx.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM ${tasks}
          WHERE ${tasks.updatedAt} >= ${startUtc}
            AND ${tasks.updatedAt} < ${endUtcExclusive}) AS total_touches,
        (SELECT COUNT(*)::int FROM ${tasks}
          WHERE ${tasks.completedAt} IS NOT NULL
            AND ${tasks.completedAt} >= ${startUtc}
            AND ${tasks.completedAt} < ${endUtcExclusive}) AS total_completes
    `);

    const totals = totalResult.rows[0] as unknown as
      | { total_touches: number; total_completes: number }
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
      totalTouches: totals?.total_touches ?? 0,
      totalCompletes: totals?.total_completes ?? 0,
    };
  });
}
