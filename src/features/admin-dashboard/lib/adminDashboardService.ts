// Unit-04: 管理者ダッシュボード集計サービス
// US-A-010: テナント内全教員のステータス集計
import { sql, eq, and, gte, isNull } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import {
  users,
  userTenantRoles,
  journalEntries,
  journalEntryTags,
  emotionTags,
} from '@/db/schema';
import type * as schema from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export type TeacherStatusCard = {
  userId: string;
  name: string;
  email: string;
  lastEntryDate: string | null;
  emotionSummary: {
    positive: number;
    negative: number;
    neutral: number;
    total: number;
  };
};

export async function getTeacherStatuses(
  db: DrizzleDb,
  tenantId: string
): Promise<TeacherStatusCard[]> {
  // 7日前の起点（Asia/Tokyo）
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // テ��ント内の���教員を取得
  const teacherRows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
    })
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

  if (teacherRows.length === 0) return [];

  const teacherIds = teacherRows.map((t) => t.userId);

  // 各教員の感情集計（直近7日）+ 最終記録日を一括取得
  const result: TeacherStatusCard[] = [];

  for (const teacher of teacherRows) {
    // 感情集計（直近7日）
    const emotionRows = await db
      .select({
        positive: sql<number>`COUNT(*) FILTER (WHERE ${emotionTags.category} = 'positive')`.as('positive'),
        negative: sql<number>`COUNT(*) FILTER (WHERE ${emotionTags.category} = 'negative')`.as('negative'),
        neutral: sql<number>`COUNT(*) FILTER (WHERE ${emotionTags.category} = 'neutral')`.as('neutral'),
      })
      .from(journalEntries)
      .innerJoin(journalEntryTags, eq(journalEntryTags.entryId, journalEntries.id))
      .innerJoin(emotionTags, eq(emotionTags.id, journalEntryTags.tagId))
      .where(
        and(
          eq(journalEntries.userId, teacher.userId),
          eq(journalEntries.tenantId, tenantId),
          gte(journalEntries.createdAt, sevenDaysAgo)
        )
      );

    const positive = Number(emotionRows[0]?.positive ?? 0);
    const negative = Number(emotionRows[0]?.negative ?? 0);
    const neutral = Number(emotionRows[0]?.neutral ?? 0);

    // 最終記録日
    const lastEntryRows = await db
      .select({
        lastDate: sql<string>`MAX(DATE(${journalEntries.createdAt} AT TIME ZONE 'Asia/Tokyo'))`.as('last_date'),
      })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.userId, teacher.userId),
          eq(journalEntries.tenantId, tenantId)
        )
      );

    result.push({
      userId: teacher.userId,
      name: teacher.name ?? teacher.email,
      email: teacher.email,
      lastEntryDate: lastEntryRows[0]?.lastDate ?? null,
      emotionSummary: {
        positive,
        negative,
        neutral,
        total: positive + negative + neutral,
      },
    });
  }

  return result;
}
