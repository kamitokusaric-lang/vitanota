// morning_card_events テーブルから H3-B 朝カード利用数を集計する。
//
// 集計方針 (chimo 2026-05-21):
//   - 全指標は **期間内ユニーク先生数 (UU)** で集計する (COUNT DISTINCT user_id)
//   - 「ログイン UU 中、 何 % の先生が朝カードに反応したか」 を見るのが H3-B 来訪価値仮説の核心
//   - 旧 COUNT(*) 集計はリロード/再 mount のたび +1 されて意味が薄かった (project_h3_morning_arrival_value)
//
// ヒートマップ: event_type='shown' を date×hour matrix で UU 集計 (= 朝に開いた先生数の時間帯分布)
// Summary: 4 種 (shown / dismissed / candidate_clicked / candidate_status_changed) の期間内ユニーク先生数
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

interface EventTypeUuRow {
  event_type: string;
  uu: number;
}

export interface MorningCardUsageResult {
  // (date, hour) ごとの shown ユニーク先生数
  shown: HourDateValue[];
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
    // shown UU を時間帯別 (ヒートマップ用): 同一先生が同じ (date, hour) に複数回 shown しても 1 とカウント
    const shownResult = await tx.execute(sql`
      SELECT
        TO_CHAR(${morningCardEvents.createdAt} AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS date,
        EXTRACT(HOUR FROM ${morningCardEvents.createdAt} AT TIME ZONE 'Asia/Tokyo')::int AS hour,
        COUNT(DISTINCT ${morningCardEvents.userId})::int AS count
      FROM ${morningCardEvents}
      WHERE ${morningCardEvents.createdAt} >= ${startUtc}
        AND ${morningCardEvents.createdAt} < ${endUtcExclusive}
        AND ${morningCardEvents.eventType} = 'shown'
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

    const shownRows = shownResult.rows as unknown as ShownByHourRow[];
    const uuRows = uuResult.rows as unknown as EventTypeUuRow[];

    const uuByType = new Map<string, number>(
      uuRows.map((r) => [r.event_type, r.uu]),
    );

    return {
      shown: shownRows.map((r) => ({
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
