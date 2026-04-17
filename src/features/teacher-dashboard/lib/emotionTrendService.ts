// Unit-03: 感情傾向集計サービス
// US-T-030: 感情タグの category (positive/negative/neutral) を日別に集計
import { sql, eq, and, gte, lt } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import { journalEntries, journalEntryTags, tags } from '@/db/schema';
import type * as schema from '@/db/schema';
import type {
  EmotionTrendDataPoint,
  EmotionTrendResponse,
} from '../schemas/emotionTrend';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

const PERIOD_DAYS: Record<string, number> = {
  week: 7,
  month: 30,
  quarter: 90,
};

function getDateRange(period: 'week' | 'month' | 'quarter'): {
  startDate: Date;
  endDate: Date;
} {
  const now = new Date();
  // Asia/Tokyo で日付を計算
  const tokyoOffset = 9 * 60; // JST は UTC+9
  const utcNow = now.getTime() + now.getTimezoneOffset() * 60_000;
  const tokyoNow = new Date(utcNow + tokyoOffset * 60_000);

  // 今日の 00:00:00 JST
  const todayJst = new Date(
    tokyoNow.getFullYear(),
    tokyoNow.getMonth(),
    tokyoNow.getDate()
  );

  const days = PERIOD_DAYS[period];
  const startJst = new Date(todayJst);
  startJst.setDate(startJst.getDate() - (days - 1));

  const endJst = new Date(todayJst);
  endJst.setDate(endJst.getDate() + 1);

  // JST → UTC に変換
  const startUtc = new Date(startJst.getTime() - tokyoOffset * 60_000);
  const endUtc = new Date(endJst.getTime() - tokyoOffset * 60_000);

  return { startDate: startUtc, endDate: endUtc };
}

export async function getEmotionTrend(
  db: DrizzleDb,
  tenantId: string,
  userId: string,
  period: 'week' | 'month' | 'quarter'
): Promise<EmotionTrendResponse> {
  const { startDate, endDate } = getDateRange(period);

  // 感情カテゴリ別の日別集計
  const rows = await db
    .select({
      date: sql<string>`DATE(${journalEntries.createdAt} AT TIME ZONE 'Asia/Tokyo')`.as('date'),
      positive: sql<number>`COUNT(*) FILTER (WHERE ${tags.category} = 'positive')`.as('positive'),
      negative: sql<number>`COUNT(*) FILTER (WHERE ${tags.category} = 'negative')`.as('negative'),
      neutral: sql<number>`COUNT(*) FILTER (WHERE ${tags.category} = 'neutral')`.as('neutral'),
    })
    .from(journalEntries)
    .innerJoin(journalEntryTags, eq(journalEntryTags.entryId, journalEntries.id))
    .innerJoin(
      tags,
      and(eq(tags.id, journalEntryTags.tagId), eq(tags.type, 'emotion'))
    )
    .where(
      and(
        eq(journalEntries.tenantId, tenantId),
        eq(journalEntries.userId, userId),
        gte(journalEntries.createdAt, startDate),
        lt(journalEntries.createdAt, endDate)
      )
    )
    .groupBy(sql`DATE(${journalEntries.createdAt} AT TIME ZONE 'Asia/Tokyo')`)
    .orderBy(sql`date ASC`);

  const data: EmotionTrendDataPoint[] = rows.map((r) => ({
    date: r.date,
    positive: Number(r.positive),
    negative: Number(r.negative),
    neutral: Number(r.neutral),
    total: Number(r.positive) + Number(r.negative) + Number(r.neutral),
  }));

  // 期間内の全エントリ数（グラフ表示判定用）
  const countResult = await db
    .select({
      count: sql<number>`COUNT(DISTINCT ${journalEntries.id})`.as('count'),
    })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.tenantId, tenantId),
        eq(journalEntries.userId, userId),
        gte(journalEntries.createdAt, startDate),
        lt(journalEntries.createdAt, endDate)
      )
    );

  return {
    period,
    data,
    totalEntries: Number(countResult[0]?.count ?? 0),
  };
}

/**
 * Unit-04: 管理者が指定した教員の感情傾向を取得
 * school_admin ロールの withTenantUser で実行するため、RLS は tenant_id のみでフィルタ。
 * targetUserId は WHERE で明示的にフィルタ。
 */
export async function getEmotionTrendForTeacher(
  db: DrizzleDb,
  tenantId: string,
  targetUserId: string,
  period: 'week' | 'month' | 'quarter'
): Promise<EmotionTrendResponse> {
  return getEmotionTrend(db, tenantId, targetUserId, period);
}

/**
 * テナント全体の感情傾向を取得（全教員の集約）
 * school_admin が学校全体のトレンドを把握するために使用。
 * userId フィルタを外し、テナント内全エントリを集計する。
 */
export async function getSchoolEmotionTrend(
  db: DrizzleDb,
  tenantId: string,
  period: 'week' | 'month' | 'quarter'
): Promise<EmotionTrendResponse> {
  const { startDate, endDate } = getDateRange(period);

  const rows = await db
    .select({
      date: sql<string>`DATE(${journalEntries.createdAt} AT TIME ZONE 'Asia/Tokyo')`.as('date'),
      positive: sql<number>`COUNT(*) FILTER (WHERE ${tags.category} = 'positive')`.as('positive'),
      negative: sql<number>`COUNT(*) FILTER (WHERE ${tags.category} = 'negative')`.as('negative'),
      neutral: sql<number>`COUNT(*) FILTER (WHERE ${tags.category} = 'neutral')`.as('neutral'),
    })
    .from(journalEntries)
    .innerJoin(journalEntryTags, eq(journalEntryTags.entryId, journalEntries.id))
    .innerJoin(
      tags,
      and(eq(tags.id, journalEntryTags.tagId), eq(tags.type, 'emotion'))
    )
    .where(
      and(
        eq(journalEntries.tenantId, tenantId),
        gte(journalEntries.createdAt, startDate),
        lt(journalEntries.createdAt, endDate)
      )
    )
    .groupBy(sql`DATE(${journalEntries.createdAt} AT TIME ZONE 'Asia/Tokyo')`)
    .orderBy(sql`date ASC`);

  const data: EmotionTrendDataPoint[] = rows.map((r) => ({
    date: r.date,
    positive: Number(r.positive),
    negative: Number(r.negative),
    neutral: Number(r.neutral),
    total: Number(r.positive) + Number(r.negative) + Number(r.neutral),
  }));

  const countResult = await db
    .select({
      count: sql<number>`COUNT(DISTINCT ${journalEntries.id})`.as('count'),
    })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.tenantId, tenantId),
        gte(journalEntries.createdAt, startDate),
        lt(journalEntries.createdAt, endDate)
      )
    );

  return {
    period,
    data,
    totalEntries: Number(countResult[0]?.count ?? 0),
  };
}
