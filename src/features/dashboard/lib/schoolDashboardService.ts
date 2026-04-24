// 全員ダッシュボード用サービス
// - 全体エンゲージ: 全校集計 (個人特定なし)
// - 教員別稼働状況: 教員名 + 未完了タスク推移 (感情情報は含まない)
//
// 踏み絵:
//   - 個別の感情情報は誰にも返さない (本人のみ自分の投稿を見る)
//   - タスク負荷は業務量の客観指標なので名前付きで全員に開示
//   - AI 分析は本機能では使わない
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import { users, userTenantRoles, userTenantProfiles } from '@/db/schema';
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

function getDays14(): string[] {
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const tokyo = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    days.push(tokyo.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * 全校の感情集計 (過去 14 日を今週 7 / 先週 7 に分割)
 * 個人特定なし。タグ付き投稿を category 別に集計 + タグなし含む総投稿件数も返す。
 */
export async function getSchoolWellness(
  db: DrizzleDb,
  tenantId: string,
): Promise<SchoolWellnessData> {
  // 感情タグ付き投稿を category 別に集計 (14 日分)
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

  // タグなしを含む総投稿件数 (14 日分)
  const totalRaw = await db.execute<{ day: string; total: number }>(sql`
    SELECT
      (date_trunc('day', je.created_at AT TIME ZONE 'Asia/Tokyo'))::date::text AS day,
      COUNT(*)::int AS total
    FROM journal_entries je
    WHERE je.tenant_id = ${tenantId}
      AND je.created_at >= (NOW() - INTERVAL '14 days')
    GROUP BY day
    ORDER BY day
  `);
  const totalMap = new Map<string, number>();
  for (const row of totalRaw.rows as Array<{ day: string; total: number }>) {
    totalMap.set(row.day, row.total);
  }

  // 今週投稿したユニーク教員数 (過去 7 日)
  const activeRaw = await db.execute<{ count: number }>(sql`
    SELECT COUNT(DISTINCT je.user_id)::int AS count
    FROM journal_entries je
    WHERE je.tenant_id = ${tenantId}
      AND je.created_at >= (NOW() - INTERVAL '7 days')
  `);
  const activeTeachersThisWeek =
    (activeRaw.rows[0] as { count: number } | undefined)?.count ?? 0;

  // 14 日を今週 / 先週に分割
  const allDays = getDays14();
  const emotionSeries = allDays.map(
    (d) => emotionMap.get(d) ?? { day: d, positive: 0, negative: 0, neutral: 0 },
  );
  const totalSeries = allDays.map((d) => ({
    day: d,
    total: totalMap.get(d) ?? 0,
  }));
  const emotionLastWeek = emotionSeries.slice(0, 7);
  const emotionThisWeek = emotionSeries.slice(7);
  const totalThisWeek = totalSeries.slice(7);

  return {
    emotionTrend: emotionThisWeek,
    emotionWeekDelta: classifyEmotionDelta(emotionThisWeek, emotionLastWeek),
    totalPostsByDay: totalThisWeek,
    activeTeachersThisWeek,
  };
}

/**
 * 教員別稼働状況 (感情情報は含まない)
 * teacher ロールのアクティブユーザーのみを対象にし、
 * 日別の未完了タスク件数を 14 日分取得して今週 7 / 先週 7 に分割する。
 */
export async function getTeachersWorkload(
  db: DrizzleDb,
  tenantId: string,
): Promise<TeacherWorkloadCard[]> {
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

  const allDays = getDays14();
  const result: TeacherWorkloadCard[] = [];

  for (const teacher of teacherRows) {
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
    const workloadSeries = allDays.map(
      (d) => workloadMap.get(d) ?? { day: d, openCount: 0 },
    );
    const workloadLastWeek = workloadSeries.slice(0, 7);
    const workloadThisWeek = workloadSeries.slice(7);

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
