// Unit-04: アラート自動検知サービス
// US-A-020: negative_trend (negative比率>=60%) / recording_gap (5日以上途絶)
import { sql, eq, and, gte, isNull } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import {
  tenants,
  users,
  userTenantRoles,
  journalEntries,
  journalEntryTags,
  emotionTags,
  alerts,
} from '@/db/schema';
import type * as schema from '@/db/schema';
import { logger } from '@/shared/lib/logger';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

const NEGATIVE_TREND_THRESHOLD = 0.6; // 60%
const NEGATIVE_TREND_PERIOD_DAYS = 7;
const RECORDING_GAP_THRESHOLD_DAYS = 5;

export type DetectionResult = {
  tenantId: string;
  alertsCreated: number;
  teachersChecked: number;
};

export async function detectAll(db: DrizzleDb): Promise<DetectionResult[]> {
  const allTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, 'active'));

  const results: DetectionResult[] = [];
  for (const tenant of allTenants) {
    const result = await detectForTenant(db, tenant.id);
    results.push(result);
  }
  return results;
}

export async function detectForTenant(
  db: DrizzleDb,
  tenantId: string
): Promise<DetectionResult> {
  // テナント内の全教員を取得
  const teacherRows = await db
    .select({ userId: users.id })
    .from(users)
    .innerJoin(
      userTenantRoles,
      and(
        eq(userTenantRoles.userId, users.id),
        eq(userTenantRoles.tenantId, tenantId),
        eq(userTenantRoles.role, 'teacher')
      )
    )
    .where(isNull(users.deletedAt));

  let alertsCreated = 0;

  for (const teacher of teacherRows) {
    const negativeCreated = await checkNegativeTrend(db, tenantId, teacher.userId);
    const gapCreated = await checkRecordingGap(db, tenantId, teacher.userId);
    if (negativeCreated) alertsCreated++;
    if (gapCreated) alertsCreated++;
  }

  return {
    tenantId,
    alertsCreated,
    teachersChecked: teacherRows.length,
  };
}

async function checkNegativeTrend(
  db: DrizzleDb,
  tenantId: string,
  userId: string
): Promise<boolean> {
  // 既に同じ type の open アラートがあればスキップ
  const existing = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(
      and(
        eq(alerts.teacherUserId, userId),
        eq(alerts.tenantId, tenantId),
        eq(alerts.type, 'negative_trend'),
        eq(alerts.status, 'open')
      )
    )
    .limit(1);

  if (existing.length > 0) return false;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - NEGATIVE_TREND_PERIOD_DAYS);

  const rows = await db
    .select({
      total: sql<number>`COUNT(*)`.as('total'),
      negative: sql<number>`COUNT(*) FILTER (WHERE ${emotionTags.category} = 'negative')`.as('negative'),
    })
    .from(journalEntries)
    .innerJoin(journalEntryTags, eq(journalEntryTags.entryId, journalEntries.id))
    .innerJoin(emotionTags, eq(emotionTags.id, journalEntryTags.tagId))
    .where(
      and(
        eq(journalEntries.userId, userId),
        eq(journalEntries.tenantId, tenantId),
        gte(journalEntries.createdAt, sevenDaysAgo)
      )
    );

  const total = Number(rows[0]?.total ?? 0);
  const negative = Number(rows[0]?.negative ?? 0);

  if (total === 0) return false; // 感情タグなし → recording_gap で検知

  const ratio = negative / total;
  if (ratio < NEGATIVE_TREND_THRESHOLD) return false;

  await db.insert(alerts).values({
    tenantId,
    teacherUserId: userId,
    type: 'negative_trend',
    status: 'open',
    detectionContext: JSON.stringify({
      period_days: NEGATIVE_TREND_PERIOD_DAYS,
      negative_ratio: Math.round(ratio * 100) / 100,
      negative_count: negative,
      total_emotion_tags: total,
      threshold: NEGATIVE_TREND_THRESHOLD,
    }),
  });

  logger.info({
    event: 'alert.created',
    type: 'negative_trend',
    tenantId,
    userId,
    ratio,
  });

  return true;
}

async function checkRecordingGap(
  db: DrizzleDb,
  tenantId: string,
  userId: string
): Promise<boolean> {
  // 既に同じ type の open アラートがあればスキップ
  const existing = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(
      and(
        eq(alerts.teacherUserId, userId),
        eq(alerts.tenantId, tenantId),
        eq(alerts.type, 'recording_gap'),
        eq(alerts.status, 'open')
      )
    )
    .limit(1);

  if (existing.length > 0) return false;

  const lastEntryRows = await db
    .select({
      lastDate: sql<string>`MAX(DATE(${journalEntries.createdAt} AT TIME ZONE 'Asia/Tokyo'))`.as('last_date'),
    })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.userId, userId),
        eq(journalEntries.tenantId, tenantId)
      )
    );

  const lastDateStr = lastEntryRows[0]?.lastDate;
  if (!lastDateStr) return false; // 記録��し（新規ユーザー）→ スキップ

  const lastDate = new Date(lastDateStr);
  const now = new Date();
  const gapDays = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

  if (gapDays < RECORDING_GAP_THRESHOLD_DAYS) return false;

  await db.insert(alerts).values({
    tenantId,
    teacherUserId: userId,
    type: 'recording_gap',
    status: 'open',
    detectionContext: JSON.stringify({
      last_entry_date: lastDateStr,
      gap_days: gapDays,
      threshold_days: RECORDING_GAP_THRESHOLD_DAYS,
    }),
  });

  logger.info({
    event: 'alert.created',
    type: 'recording_gap',
    tenantId,
    userId,
    gapDays,
  });

  return true;
}
