// 全員ダッシュボード用サービス
// - 全体エンゲージ: 全校集計 (個人特定なし)
// - 教員別稼働状況: 教員名 + 未完了タスク推移 (感情情報は含まない)
//
// 踏み絵:
//   - 個別の感情情報は誰にも返さない (本人のみ自分の投稿を見る)
//   - タスク負荷は業務量の客観指標なので名前付きで全員に開示
//   - AI 分析は本機能では使わない
//   - 集計クエリは isPublic に関わらず全投稿を対象にする
//     (non-public 投稿も分析材料。ただし school_admin は集計結果のみ見える構造で
//      個別の本文にはアクセスしない)
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import { users, userTenantRoles, userTenantProfiles } from '@/db/schema';
import type * as schema from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export type TrendDirection = 'up' | 'down' | 'flat';

// 期間選択 (学校エンゲージメントの集計期間)
export type PeriodKey = '1w' | '1m' | '3m';
export const PERIOD_DAYS: Record<PeriodKey, number> = {
  '1w': 7,
  '1m': 30,
  '3m': 90,
};
export const PERIOD_LABEL: Record<PeriodKey, string> = {
  '1w': '1週間',
  '1m': '1ヶ月',
  '3m': '3ヶ月',
};
export const PERIOD_COMPARISON_LABEL: Record<PeriodKey, string> = {
  '1w': '先週比',
  '1m': '先月比',
  '3m': '前期比',
};

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

// 全校の感情集計 (個人特定なし)
export interface SchoolWellnessData {
  emotionTrend: EmotionDay[]; // 直近 7 日 (末尾が今日)
  emotionWeekDelta: TrendDirection;
  totalPostsByDay: Array<{ day: string; total: number }>; // タグなしを含む総投稿件数
  activeTeachersThisWeek: number; // 今週 1 回以上投稿した教員数
}

// 教員別稼働状況 (感情情報は含まない)
export interface TeacherWorkloadCard {
  userId: string;
  name: string;
  nickname: string | null;
  workloadTrend: WorkloadDay[]; // 直近 7 日
  workloadWeekDelta: TrendDirection;
}

// mood 別 (絵文字 5 段階) の全校集計
export type MoodLevel =
  | 'very_positive'
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'very_negative';

export interface MoodDay {
  day: string; // YYYY-MM-DD (JST)
  very_positive: number;
  positive: number;
  neutral: number;
  negative: number;
  very_negative: number;
}

export interface SchoolMoodAnalysisData {
  moodTrend: MoodDay[]; // 直近 7 日
  moodWeekDelta: TrendDirection; // ポジ寄り度の先週比
  totalByMood: Record<MoodLevel, number>; // 今週合計
  totalWithMood: number; // mood 付き投稿の今週合計
}

const EMOTION_DELTA_THRESHOLD = 5; // ポジ率 ±5pt
const WORKLOAD_DELTA_THRESHOLD = 2; // 未完了 ±2 件

function positiveRatio(days: EmotionDay[]): number {
  let pos = 0;
  let total = 0;
  for (const d of days) {
    pos += d.positive;
    total += d.positive + d.negative + d.neutral;
  }
  return total === 0 ? 0 : (pos / total) * 100;
}

function classifyEmotionDelta(
  thisWeek: EmotionDay[],
  lastWeek: EmotionDay[],
): TrendDirection {
  const diff = positiveRatio(thisWeek) - positiveRatio(lastWeek);
  if (diff > EMOTION_DELTA_THRESHOLD) return 'up';
  if (diff < -EMOTION_DELTA_THRESHOLD) return 'down';
  return 'flat';
}

// mood ベースのポジ寄り度: very_positive=+2, positive=+1, neutral=0, negative=-1, very_negative=-2 の加重平均
function moodPositivityScore(days: MoodDay[]): number {
  let weighted = 0;
  let total = 0;
  for (const d of days) {
    weighted +=
      d.very_positive * 2 +
      d.positive * 1 +
      d.neutral * 0 +
      d.negative * -1 +
      d.very_negative * -2;
    total +=
      d.very_positive + d.positive + d.neutral + d.negative + d.very_negative;
  }
  return total === 0 ? 0 : weighted / total;
}

function classifyMoodDelta(
  thisWeek: MoodDay[],
  lastWeek: MoodDay[],
): TrendDirection {
  const diff = moodPositivityScore(thisWeek) - moodPositivityScore(lastWeek);
  // スコアは -2〜+2 の範囲。±0.2 を閾値とする
  if (diff > 0.2) return 'up';
  if (diff < -0.2) return 'down';
  return 'flat';
}

function classifyWorkloadDelta(
  thisWeek: WorkloadDay[],
  lastWeek: WorkloadDay[],
): TrendDirection {
  const today = thisWeek[thisWeek.length - 1]?.openCount ?? 0;
  const lastWeekEnd = lastWeek[lastWeek.length - 1]?.openCount ?? 0;
  const diff = today - lastWeekEnd;
  if (diff > WORKLOAD_DELTA_THRESHOLD) return 'up';
  if (diff < -WORKLOAD_DELTA_THRESHOLD) return 'down';
  return 'flat';
}

// 日別データを 7 日単位で集約 (1ヶ月・3ヶ月表示用)
// 週ラベルは週末の日付を採用する
export function aggregateMoodByWeek(days: MoodDay[]): MoodDay[] {
  const weeks: MoodDay[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    if (chunk.length === 0) continue;
    const last = chunk[chunk.length - 1];
    weeks.push({
      day: last.day,
      very_positive: chunk.reduce((a, b) => a + b.very_positive, 0),
      positive: chunk.reduce((a, b) => a + b.positive, 0),
      neutral: chunk.reduce((a, b) => a + b.neutral, 0),
      negative: chunk.reduce((a, b) => a + b.negative, 0),
      very_negative: chunk.reduce((a, b) => a + b.very_negative, 0),
    });
  }
  return weeks;
}

export function aggregateEmotionByWeek(days: EmotionDay[]): EmotionDay[] {
  const weeks: EmotionDay[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    if (chunk.length === 0) continue;
    const last = chunk[chunk.length - 1];
    weeks.push({
      day: last.day,
      positive: chunk.reduce((a, b) => a + b.positive, 0),
      negative: chunk.reduce((a, b) => a + b.negative, 0),
      neutral: chunk.reduce((a, b) => a + b.neutral, 0),
    });
  }
  return weeks;
}

export function aggregateTotalByWeek(
  days: Array<{ day: string; total: number }>,
): Array<{ day: string; total: number }> {
  const weeks: Array<{ day: string; total: number }> = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    if (chunk.length === 0) continue;
    const last = chunk[chunk.length - 1];
    weeks.push({
      day: last.day,
      total: chunk.reduce((a, b) => a + b.total, 0),
    });
  }
  return weeks;
}

// 過去 (days*2) 日分の日付文字列を今期+前期ぶん生成
function getDaysRange(days: number): string[] {
  const total = days * 2;
  const result: string[] = [];
  for (let i = total - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const tokyo = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    result.push(tokyo.toISOString().slice(0, 10));
  }
  return result;
}

/**
 * 全校の感情タグ集計 (過去 period*2 日を今期 period / 前期 period に分割)
 * 個人特定なし。公開・非公開問わず全タグ付き投稿を category 別に集計する。
 */
export async function getSchoolWellness(
  db: DrizzleDb,
  tenantId: string,
  periodDays: number = 7,
): Promise<SchoolWellnessData> {
  const totalDays = periodDays * 2;
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
    WHERE je.tenant_id = ${tenantId}
      AND je.created_at >= NOW() - (${totalDays}::int * INTERVAL '1 day')
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

  // タグなしを含む総投稿件数 (period*2 日分)
  const totalRaw = await db.execute<{ day: string; total: number }>(sql`
    SELECT
      (date_trunc('day', je.created_at AT TIME ZONE 'Asia/Tokyo'))::date::text AS day,
      COUNT(*)::int AS total
    FROM journal_entries je
    WHERE je.tenant_id = ${tenantId}
      AND je.created_at >= NOW() - (${totalDays}::int * INTERVAL '1 day')
    GROUP BY day
    ORDER BY day
  `);
  const totalMap = new Map<string, number>();
  for (const row of totalRaw.rows as Array<{ day: string; total: number }>) {
    totalMap.set(row.day, row.total);
  }

  // 今期投稿したユニーク教員数
  const activeRaw = await db.execute<{ count: number }>(sql`
    SELECT COUNT(DISTINCT je.user_id)::int AS count
    FROM journal_entries je
    WHERE je.tenant_id = ${tenantId}
      AND je.created_at >= NOW() - (${periodDays}::int * INTERVAL '1 day')
  `);
  const activeTeachersThisWeek =
    (activeRaw.rows[0] as { count: number } | undefined)?.count ?? 0;

  // period*2 日を今期 / 前期に分割
  const allDays = getDaysRange(periodDays);
  const emotionSeries = allDays.map(
    (d) => emotionMap.get(d) ?? { day: d, positive: 0, negative: 0, neutral: 0 },
  );
  const totalSeries = allDays.map((d) => ({
    day: d,
    total: totalMap.get(d) ?? 0,
  }));
  const emotionLastWeek = emotionSeries.slice(0, periodDays);
  const emotionThisWeek = emotionSeries.slice(periodDays);
  const totalThisWeek = totalSeries.slice(periodDays);

  return {
    emotionTrend: emotionThisWeek,
    emotionWeekDelta: classifyEmotionDelta(emotionThisWeek, emotionLastWeek),
    totalPostsByDay: totalThisWeek,
    activeTeachersThisWeek,
  };
}

/**
 * 全校の mood 別集計 (絵文字 5 段階、過去 period*2 日を今期 / 前期に分割)
 * 個人特定なし。公開・非公開問わず mood 付き投稿を集計する。
 * mood は journal_entries.mood に保存されており、既存 (NULL) は集計対象外。
 */
export async function getSchoolMoodAnalysis(
  db: DrizzleDb,
  tenantId: string,
  periodDays: number = 7,
): Promise<SchoolMoodAnalysisData> {
  const totalDays = periodDays * 2;
  const moodRaw = await db.execute<{
    day: string;
    mood: MoodLevel;
    cnt: number;
  }>(sql`
    SELECT
      (date_trunc('day', je.created_at AT TIME ZONE 'Asia/Tokyo'))::date::text AS day,
      je.mood::text AS mood,
      COUNT(*)::int AS cnt
    FROM journal_entries je
    WHERE je.tenant_id = ${tenantId}
      AND je.created_at >= NOW() - (${totalDays}::int * INTERVAL '1 day')
      AND je.mood IS NOT NULL
    GROUP BY day, je.mood
    ORDER BY day
  `);

  const moodMap = new Map<string, MoodDay>();
  for (const row of moodRaw.rows as Array<{ day: string; mood: MoodLevel; cnt: number }>) {
    const bucket: MoodDay = moodMap.get(row.day) ?? {
      day: row.day,
      very_positive: 0,
      positive: 0,
      neutral: 0,
      negative: 0,
      very_negative: 0,
    };
    bucket[row.mood] = row.cnt;
    moodMap.set(row.day, bucket);
  }

  const allDays = getDaysRange(periodDays);
  const moodSeries: MoodDay[] = allDays.map(
    (d) =>
      moodMap.get(d) ?? {
        day: d,
        very_positive: 0,
        positive: 0,
        neutral: 0,
        negative: 0,
        very_negative: 0,
      },
  );
  const moodLastWeek = moodSeries.slice(0, periodDays);
  const moodThisWeek = moodSeries.slice(periodDays);

  const totalByMood: Record<MoodLevel, number> = {
    very_positive: 0,
    positive: 0,
    neutral: 0,
    negative: 0,
    very_negative: 0,
  };
  let totalWithMood = 0;
  for (const d of moodThisWeek) {
    totalByMood.very_positive += d.very_positive;
    totalByMood.positive += d.positive;
    totalByMood.neutral += d.neutral;
    totalByMood.negative += d.negative;
    totalByMood.very_negative += d.very_negative;
    totalWithMood +=
      d.very_positive + d.positive + d.neutral + d.negative + d.very_negative;
  }

  return {
    moodTrend: moodThisWeek,
    moodWeekDelta: classifyMoodDelta(moodThisWeek, moodLastWeek),
    totalByMood,
    totalWithMood,
  };
}

/**
 * 教員別稼働状況 (感情情報は含まない)
 * teacher ロールのアクティブユーザーのみを対象にし、
 * 日別の未完了タスク件数を period*2 日分取得して今期 / 前期に分割する。
 */
export async function getTeachersWorkload(
  db: DrizzleDb,
  tenantId: string,
  periodDays: number = 7,
): Promise<TeacherWorkloadCard[]> {
  const totalDays = periodDays * 2;
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

  const allDays = getDaysRange(periodDays);
  const result: TeacherWorkloadCard[] = [];

  for (const teacher of teacherRows) {
    const workloadRaw = await db.execute<{ day: string; open_count: number }>(sql`
      WITH days AS (
        SELECT (CURRENT_DATE - offs)::date AS day
        FROM generate_series(0, ${totalDays - 1}::int) AS offs
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
    const workloadSeries = allDays.map(
      (d) => workloadMap.get(d) ?? { day: d, openCount: 0 },
    );
    const workloadLastWeek = workloadSeries.slice(0, periodDays);
    const workloadThisWeek = workloadSeries.slice(periodDays);

    result.push({
      userId: teacher.userId,
      name: teacher.name ?? teacher.email,
      nickname: teacher.nickname,
      workloadTrend: workloadThisWeek,
      workloadWeekDelta: classifyWorkloadDelta(workloadThisWeek, workloadLastWeek),
    });
  }

  return result;
}
