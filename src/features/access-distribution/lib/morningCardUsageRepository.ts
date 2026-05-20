// morning_card_events テーブルから H3-B 朝カード利用数を集計する。
//
// ヒートマップ用: event_type='shown' のみを date×hour matrix で取得 (= 朝開いた回数)。
// Summary 用: 4 種 (shown / dismissed / candidate_clicked / candidate_status_changed) の総数。
//
// withSystemAdmin context で query (RLS で system_admin に全可視)。
import { sql } from 'drizzle-orm';
import { withSystemAdmin } from '@/shared/lib/db';
import { morningCardEvents } from '@/db/schema';
import type { HourDateValue } from './aggregator';

interface ShownByHourRow {
  date: string;
  hour: number;
  count: number;
}

interface EventTypeTotalsRow {
  event_type: string;
  total: number;
}

export interface MorningCardUsageResult {
  shown: HourDateValue[];
  totalShown: number;
  totalDismissed: number;
  totalCandidateClicked: number;
  totalCandidateStatusChanged: number;
}

export async function getMorningCardUsageByHourDate(
  adminUserId: string,
  startUtc: Date,
  endUtcExclusive: Date,
): Promise<MorningCardUsageResult> {
  return withSystemAdmin(adminUserId, async (tx) => {
    // shown のみ時間帯別 (ヒートマップ用)
    const shownResult = await tx.execute(sql`
      SELECT
        TO_CHAR(${morningCardEvents.createdAt} AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS date,
        EXTRACT(HOUR FROM ${morningCardEvents.createdAt} AT TIME ZONE 'Asia/Tokyo')::int AS hour,
        COUNT(*)::int AS count
      FROM ${morningCardEvents}
      WHERE ${morningCardEvents.createdAt} >= ${startUtc}
        AND ${morningCardEvents.createdAt} < ${endUtcExclusive}
        AND ${morningCardEvents.eventType} = 'shown'
      GROUP BY 1, 2
      ORDER BY 1, 2
    `);

    // 4 種別の総数 (Summary 用)
    const totalsResult = await tx.execute(sql`
      SELECT
        ${morningCardEvents.eventType}::text AS event_type,
        COUNT(*)::int AS total
      FROM ${morningCardEvents}
      WHERE ${morningCardEvents.createdAt} >= ${startUtc}
        AND ${morningCardEvents.createdAt} < ${endUtcExclusive}
      GROUP BY 1
    `);

    const shownRows = shownResult.rows as unknown as ShownByHourRow[];
    const totalRows = totalsResult.rows as unknown as EventTypeTotalsRow[];

    const totals = new Map<string, number>(
      totalRows.map((r) => [r.event_type, r.total]),
    );

    return {
      shown: shownRows.map((r) => ({
        date: r.date,
        hour: r.hour,
        count: r.count,
      })),
      totalShown: totals.get('shown') ?? 0,
      totalDismissed: totals.get('dismissed') ?? 0,
      totalCandidateClicked: totals.get('candidate_clicked') ?? 0,
      totalCandidateStatusChanged:
        totals.get('candidate_status_changed') ?? 0,
    };
  });
}
