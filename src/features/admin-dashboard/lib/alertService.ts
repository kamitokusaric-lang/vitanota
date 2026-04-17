// Unit-04: アラート管理サービス
// US-A-020: アクティブアラート一覧 / US-A-021: アラートクローズ
import { eq, and, desc } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import { alerts, users } from '@/db/schema';
import type * as schema from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export type AlertListItem = {
  id: string;
  teacherUserId: string;
  teacherName: string;
  type: 'negative_trend' | 'recording_gap';
  status: 'open' | 'closed';
  detectionContext: Record<string, unknown>;
  createdAt: string;
};

export async function getOpenAlerts(
  db: DrizzleDb,
  tenantId: string
): Promise<AlertListItem[]> {
  const rows = await db
    .select({
      id: alerts.id,
      teacherUserId: alerts.teacherUserId,
      teacherName: users.name,
      teacherEmail: users.email,
      type: alerts.type,
      status: alerts.status,
      detectionContext: alerts.detectionContext,
      createdAt: alerts.createdAt,
    })
    .from(alerts)
    .innerJoin(users, eq(users.id, alerts.teacherUserId))
    .where(and(eq(alerts.tenantId, tenantId), eq(alerts.status, 'open')))
    .orderBy(desc(alerts.createdAt));

  return rows.map((r) => ({
    id: r.id,
    teacherUserId: r.teacherUserId,
    teacherName: r.teacherName ?? r.teacherEmail,
    type: r.type,
    status: r.status,
    detectionContext: typeof r.detectionContext === 'string'
      ? JSON.parse(r.detectionContext) as Record<string, unknown>
      : (r.detectionContext as Record<string, unknown>),
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function closeAlert(
  db: DrizzleDb,
  alertId: string,
  closedByUserId: string,
  tenantId: string
): Promise<AlertListItem | null> {
  const [updated] = await db
    .update(alerts)
    .set({
      status: 'closed',
      closedBy: closedByUserId,
      closedAt: new Date(),
    })
    .where(
      and(
        eq(alerts.id, alertId),
        eq(alerts.tenantId, tenantId),
        eq(alerts.status, 'open')
      )
    )
    .returning();

  if (!updated) return null;

  // 教員名を取得
  const [teacher] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, updated.teacherUserId))
    .limit(1);

  return {
    id: updated.id,
    teacherUserId: updated.teacherUserId,
    teacherName: teacher?.name ?? teacher?.email ?? '',
    type: updated.type,
    status: updated.status,
    detectionContext: typeof updated.detectionContext === 'string'
      ? JSON.parse(updated.detectionContext) as Record<string, unknown>
      : (updated.detectionContext as Record<string, unknown>),
    createdAt: updated.createdAt.toISOString(),
  };
}
