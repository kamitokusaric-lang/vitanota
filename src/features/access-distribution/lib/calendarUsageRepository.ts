// calendar_events テーブルからカレンダー機能 (Unit-06) 利用数を集計する。
//
// 集計方針 (chimo 2026-05-30):
//   バブルチャート用に 日付 × 時間帯 × event 種別の件数を返す。
//   x=日付 / y=時間帯(JST) / 色=event 種別 / 大きさ=件数。
//   新 H3 仮説 (週/月の偏り把握 + calendar が朝の来訪価値を代替できるか) の検証データ。
//
// withSystemAdmin context で query (RLS で system_admin に全可視)。
import { sql } from 'drizzle-orm';
import { withSystemAdmin } from '@/shared/lib/db';
import { calendarEvents } from '@/db/schema';

// 日付 × 時間帯 (0-23 JST) × event 種別の件数 (バブルチャート用)。
// 1 点 = (date, hour, event_type) の COUNT(*)。
export interface DateHourEventCountRow {
  date: string;
  hour: number;
  event_type: string;
  count: number;
}

export async function getCalendarDateHourEventPoints(
  adminUserId: string,
  startUtc: Date,
  endUtcExclusive: Date,
): Promise<DateHourEventCountRow[]> {
  return withSystemAdmin(adminUserId, async (tx) => {
    const result = await tx.execute(sql`
      SELECT
        TO_CHAR(${calendarEvents.createdAt} AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS date,
        EXTRACT(HOUR FROM ${calendarEvents.createdAt} AT TIME ZONE 'Asia/Tokyo')::int AS hour,
        ${calendarEvents.eventType}::text AS event_type,
        COUNT(*)::int AS count
      FROM ${calendarEvents}
      WHERE ${calendarEvents.createdAt} >= ${startUtc}
        AND ${calendarEvents.createdAt} < ${endUtcExclusive}
      GROUP BY 1, 2, 3
      ORDER BY 1, 2, 3
    `);
    return result.rows as unknown as DateHourEventCountRow[];
  });
}
