// 管理者ダッシュボード集計サービス
// 各教員について以下を返す:
//   - 直近 7 日の日別感情トレンド (positive/negative/neutral 別 count)
//   - 直近 7 日の日別稼働負荷 (Done 以外のタスクを日別にスナップショット)
//   - 感情先週比 (ネガ率の今週 vs 先週の変化で ↑/↓/→ 判定、ルールベース)
//   - 稼働負荷先週比 (今日 vs 7 日前の未完了件数差で判定)
//
// AI 分析は本機能では使わない (哲学踏み絵「管理者が他者を AI で分析しない」)
// 本人向け振り返り AI は別タブ・別バッチで実装予定
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import {
  users,
  userTenantRoles,
  userTenantProfiles,
} from '@/db/schema';
import type * as schema from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export type TrendDirection = 'up' | 'down' | 'flat';

export interface EmotionDay {
  day: string; // YYYY-MM-DD (JST)
  positive: number;
  negative: number;
  neutral: number;
}

export interface WorkloadDay {
  day: string;
  openCount: number;
}

export type TeacherStatusCard = {
  userId: string;
  name: string;
  nickname: string | null;
  email: string;
  lastEntryDate: string | null;
  emotionTrend: EmotionDay[]; // 直近 7 日
  emotionWeekDelta: TrendDirection;
  workloadTrend: WorkloadDay[]; // 直近 7 日
  workloadWeekDelta: TrendDirection;
};

// ネガ率 (%) で ±5pt 超を悪化/改善判定する閾値
const EMOTION_DELTA_THRESHOLD = 5;
// 未完了件数で ±2 件超を増加/減少判定する閾値
const WORKLOAD_DELTA_THRESHOLD = 2;

function negativeRatio(days: EmotionDay[]): number {
  let neg = 0;
  let total = 0;
  for (const d of days) {
    neg += d.negative;
    total += d.positive + d.negative + d.neutral;
  }
  return total === 0 ? 0 : (neg / total) * 100;
}

function classifyEmotionDelta(thisWeek: EmotionDay[], lastWeek: EmotionDay[]): TrendDirection {
  const diff = negativeRatio(thisWeek) - negativeRatio(lastWeek);
  if (diff > EMOTION_DELTA_THRESHOLD) return 'up'; // ネガ率増 = 悪化
  if (diff < -EMOTION_DELTA_THRESHOLD) return 'down'; // ネガ率減 = 改善
  return 'flat';
}

function classifyWorkloadDelta(thisWeek: WorkloadDay[], lastWeek: WorkloadDay[]): TrendDirection {
  // 最終日 (今日) と先週末の未完了件数差で判定
  const today = thisWeek[thisWeek.length - 1]?.openCount ?? 0;
  const lastWeekEnd = lastWeek[lastWeek.length - 1]?.openCount ?? 0;
  const diff = today - lastWeekEnd;
  if (diff > WORKLOAD_DELTA_THRESHOLD) return 'up';
  if (diff < -WORKLOAD_DELTA_THRESHOLD) return 'down';
  return 'flat';
}

export async function getTeacherStatuses(
  db: DrizzleDb,
  tenantId: string,
): Promise<TeacherStatusCard[]> {
  const teacherRows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      nickname: userTenantProfiles.nickname,
    })
    .from(users)
    .innerJoin(
      userTenantRoles,
      and(
        eq(userTenantRoles.userId, users.id),
        eq(userTenantRoles.tenantId, tenantId),
        eq(userTenantRoles.role, 'teacher'),
      ),
    )
    .leftJoin(
      userTenantProfiles,
      and(
        eq(userTenantProfiles.userId, users.id),
        eq(userTenantProfiles.tenantId, tenantId),
      ),
    )
    .where(isNull(users.deletedAt));

  if (teacherRows.length === 0) return [];

  const result: TeacherStatusCard[] = [];

  for (const teacher of teacherRows) {
    // ── 感情トレンド (過去 14 日 = 今週 7 + 先週 7) ──
    const emotionRaw = await db.execute<{
      day: string;
      category: 'positive' | 'negative' | 'neutral';
      cnt: number;
    }>(sql`
      SELECT
        (date_trunc('day', je.created_at AT TIME ZONE 'Asia/Tokyo'))::date::text AS day,
        et.category::text AS category,
        COUNT(*)::int AS cnt
      FROM journal_entries je
      JOIN journal_entry_tags jet ON jet.entry_id = je.id
      JOIN emotion_tags et ON et.id = jet.tag_id
      WHERE je.user_id = ${teacher.userId}
        AND je.tenant_id = ${tenantId}
        AND je.created_at >= (NOW() - INTERVAL '14 days')
      GROUP BY day, et.category
      ORDER BY day
    `);

    const emotionMap = new Map<string, EmotionDay>();
    for (const row of emotionRaw.rows as Array<{ day: string; category: string; cnt: number }>) {
      const bucket = emotionMap.get(row.day) ?? {
        day: row.day,
        positive: 0,
        negative: 0,
        neutral: 0,
      };
      if (row.category === 'positive') bucket.positive = row.cnt;
      else if (row.category === 'negative') bucket.negative = row.cnt;
      else if (row.category === 'neutral') bucket.neutral = row.cnt;
      emotionMap.set(row.day, bucket);
    }

    // ── 稼働負荷トレンド (過去 14 日の日別未完了数) ──
    const workloadRaw = await db.execute<{ day: string; open_count: number }>(sql`
      WITH days AS (
        SELECT (CURRENT_DATE - offs)::date AS day
        FROM generate_series(0, 13) AS offs
      )
      SELECT
        days.day::text AS day,
        COUNT(tasks.id)::int AS open_count
      FROM days
      LEFT JOIN tasks
        ON tasks.owner_user_id = ${teacher.userId}
        AND tasks.tenant_id = ${tenantId}
        AND (tasks.created_at AT TIME ZONE 'Asia/Tokyo')::date <= days.day
        AND (
          tasks.completed_at IS NULL
          OR (tasks.completed_at AT TIME ZONE 'Asia/Tokyo')::date > days.day
        )
      GROUP BY days.day
      ORDER BY days.day
    `);

    const workloadMap = new Map<string, WorkloadDay>();
    for (const row of workloadRaw.rows as Array<{ day: string; open_count: number }>) {
      workloadMap.set(row.day, { day: row.day, openCount: row.open_count });
    }

    // ── 14 日分を今週 7 / 先週 7 に分割 (末尾が今日) ──
    const allDays: string[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      // Asia/Tokyo 基準の日付文字列
      const tokyo = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      const iso = tokyo.toISOString().slice(0, 10);
      allDays.push(iso);
    }
    const emotionSeries = allDays.map(
      (d) => emotionMap.get(d) ?? { day: d, positive: 0, negative: 0, neutral: 0 },
    );
    const workloadSeries = allDays.map(
      (d) => workloadMap.get(d) ?? { day: d, openCount: 0 },
    );
    const emotionLastWeek = emotionSeries.slice(0, 7);
    const emotionThisWeek = emotionSeries.slice(7);
    const workloadLastWeek = workloadSeries.slice(0, 7);
    const workloadThisWeek = workloadSeries.slice(7);

    // ── 最終記録日 ──
    const lastEntryRaw = await db.execute<{ last_date: string | null }>(sql`
      SELECT MAX((created_at AT TIME ZONE 'Asia/Tokyo')::date)::text AS last_date
      FROM journal_entries
      WHERE user_id = ${teacher.userId}
        AND tenant_id = ${tenantId}
    `);
    const lastEntryDate =
      (lastEntryRaw.rows[0] as { last_date: string | null } | undefined)?.last_date ?? null;

    result.push({
      userId: teacher.userId,
      name: teacher.name ?? teacher.email,
      nickname: teacher.nickname,
      email: teacher.email,
      lastEntryDate,
      emotionTrend: emotionThisWeek,
      emotionWeekDelta: classifyEmotionDelta(emotionThisWeek, emotionLastWeek),
      workloadTrend: workloadThisWeek,
      workloadWeekDelta: classifyWorkloadDelta(workloadThisWeek, workloadLastWeek),
    });
  }

  return result;
}
