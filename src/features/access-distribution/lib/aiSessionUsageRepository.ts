// ai_sessions テーブルから AI 機能利用数を date×hour matrix で取得する。
// 集計基準: ai_sessions.created_at の JST date×hour、 件数 (重複含む total count)。
// 集計対象: type='quick_capture' (H1 雑投げ整理) のみ。
// chimo 2026-05-20: morning_plan (H3) は撤去 (project_h3_reframing_20260520)。
// withSystemAdmin context で query (ai_sessions は RLS で system_admin に全可視)。
import { sql } from 'drizzle-orm';
import { withSystemAdmin } from '@/shared/lib/db';
import { aiSessions } from '@/db/schema';
import type { DateCountValue, HourDateValue } from './aggregator';

interface AiSessionTypeRow {
  type: string;
  date: string;
  hour: number;
  count: number;
}

export async function getAiSessionUsageByHourDate(
  adminUserId: string,
  startUtc: Date,
  endUtcExclusive: Date,
): Promise<{
  quickCapture: HourDateValue[];
  totalQuickCaptureSessions: number;
}> {
  return withSystemAdmin(adminUserId, async (tx) => {
    const result = await tx.execute(sql`
      SELECT
        ${aiSessions.type}::text AS type,
        TO_CHAR(${aiSessions.createdAt} AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS date,
        EXTRACT(HOUR FROM ${aiSessions.createdAt} AT TIME ZONE 'Asia/Tokyo')::int AS hour,
        COUNT(*)::int AS count
      FROM ${aiSessions}
      WHERE ${aiSessions.createdAt} >= ${startUtc}
        AND ${aiSessions.createdAt} < ${endUtcExclusive}
        AND ${aiSessions.type} = 'quick_capture'
      GROUP BY 1, 2, 3
      ORDER BY 1, 2, 3
    `);

    const rows = result.rows as unknown as AiSessionTypeRow[];
    const quickCapture: HourDateValue[] = [];
    let totalQuickCaptureSessions = 0;

    for (const row of rows) {
      const point: HourDateValue = {
        date: row.date,
        hour: row.hour,
        count: row.count,
      };
      quickCapture.push(point);
      totalQuickCaptureSessions += row.count;
    }

    return {
      quickCapture,
      totalQuickCaptureSessions,
    };
  });
}

// 日次 quick_capture 件数 (折れ線グラフ用)。
export async function getDailyQuickCapture(
  adminUserId: string,
  startUtc: Date,
  endUtcExclusive: Date,
): Promise<DateCountValue[]> {
  return withSystemAdmin(adminUserId, async (tx) => {
    const result = await tx.execute(sql`
      SELECT
        TO_CHAR(${aiSessions.createdAt} AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS count
      FROM ${aiSessions}
      WHERE ${aiSessions.createdAt} >= ${startUtc}
        AND ${aiSessions.createdAt} < ${endUtcExclusive}
        AND ${aiSessions.type} = 'quick_capture'
      GROUP BY 1
      ORDER BY 1
    `);
    return result.rows as unknown as DateCountValue[];
  });
}
