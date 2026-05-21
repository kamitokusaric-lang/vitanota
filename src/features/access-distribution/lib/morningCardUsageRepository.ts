// morning_card_events テーブルから H3-B 朝カード利用数を集計する。
//
// 集計方針 (chimo 2026-05-22):
//   - ヒートマップ / 日次折れ線: **候補ボタンクリック件数 (COUNT(*))** を集計する
//     event_type IN ('candidate_clicked', 'candidate_status_changed') が対象。
//     dismissed (閉じる) と shown (impression) は除外。
//     COUNT(*) なので 1 先生が複数回押せば積み上がる (= 純粋なクリックイベント数)。
//   - Summary: 4 種 (shown / dismissed / candidate_clicked / candidate_status_changed)
//     の期間内ユニーク先生数 (UU)。 反応率 / 閉じる率の分母分子に使う。
//
// withSystemAdmin context で query (RLS で system_admin に全可視)。
import { sql } from 'drizzle-orm';
import { withSystemAdmin } from '@/shared/lib/db';
import { morningCardEvents } from '@/db/schema';
import type { DateCountValue, HourDateValue } from './aggregator';

interface ClicksByHourRow {
  date: string;
  hour: number;
  count: number;
}

interface EventTypeUuRow {
  event_type: string;
  uu: number;
}

export interface MorningCardUsageResult {
  // (date, hour) ごとの 候補ボタンクリック件数 (COUNT(*))
  clicks: HourDateValue[];
  // 期間内ユニーク先生数 (反応率の分母 = shownUu)
  shownUu: number;
  dismissedUu: number;
  candidateClickedUu: number;
  candidateStatusChangedUu: number;
}

export async function getMorningCardUsageByHourDate(
  adminUserId: string,
  startUtc: Date,
  endUtcExclusive: Date,
): Promise<MorningCardUsageResult> {
  return withSystemAdmin(adminUserId, async (tx) => {
    // 候補ボタンクリック件数を時間帯別 (ヒートマップ用): COUNT(*)
    const clicksResult = await tx.execute(sql`
      SELECT
        TO_CHAR(${morningCardEvents.createdAt} AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS date,
        EXTRACT(HOUR FROM ${morningCardEvents.createdAt} AT TIME ZONE 'Asia/Tokyo')::int AS hour,
        COUNT(*)::int AS count
      FROM ${morningCardEvents}
      WHERE ${morningCardEvents.createdAt} >= ${startUtc}
        AND ${morningCardEvents.createdAt} < ${endUtcExclusive}
        AND ${morningCardEvents.eventType} IN ('candidate_clicked', 'candidate_status_changed')
      GROUP BY 1, 2
      ORDER BY 1, 2
    `);

    // 4 種別の期間内ユニーク先生数 (反応率 / 閉じる率 / クリック率の分子)
    const uuResult = await tx.execute(sql`
      SELECT
        ${morningCardEvents.eventType}::text AS event_type,
        COUNT(DISTINCT ${morningCardEvents.userId})::int AS uu
      FROM ${morningCardEvents}
      WHERE ${morningCardEvents.createdAt} >= ${startUtc}
        AND ${morningCardEvents.createdAt} < ${endUtcExclusive}
      GROUP BY 1
    `);

    const clicksRows = clicksResult.rows as unknown as ClicksByHourRow[];
    const uuRows = uuResult.rows as unknown as EventTypeUuRow[];

    const uuByType = new Map<string, number>(
      uuRows.map((r) => [r.event_type, r.uu]),
    );

    return {
      clicks: clicksRows.map((r) => ({
        date: r.date,
        hour: r.hour,
        count: r.count,
      })),
      shownUu: uuByType.get('shown') ?? 0,
      dismissedUu: uuByType.get('dismissed') ?? 0,
      candidateClickedUu: uuByType.get('candidate_clicked') ?? 0,
      candidateStatusChangedUu: uuByType.get('candidate_status_changed') ?? 0,
    };
  });
}

// 日次 朝カード 候補ボタンクリック件数 (折れ線グラフ用): JST date 単位の COUNT(*)。
export async function getDailyMorningCardClicks(
  adminUserId: string,
  startUtc: Date,
  endUtcExclusive: Date,
): Promise<DateCountValue[]> {
  return withSystemAdmin(adminUserId, async (tx) => {
    const result = await tx.execute(sql`
      SELECT
        TO_CHAR(${morningCardEvents.createdAt} AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS count
      FROM ${morningCardEvents}
      WHERE ${morningCardEvents.createdAt} >= ${startUtc}
        AND ${morningCardEvents.createdAt} < ${endUtcExclusive}
        AND ${morningCardEvents.eventType} IN ('candidate_clicked', 'candidate_status_changed')
      GROUP BY 1
      ORDER BY 1
    `);
    return result.rows as unknown as DateCountValue[];
  });
}
