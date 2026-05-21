// isAiPost 判定用の system_admin user_id 集合を返すユーティリティ。
//
// なぜ別関数か:
//   user_tenant_roles の RLS は teacher / school_admin = tenant access。
//   system_admin ロール行は tenant_id=NULL で保存されるため、 teacher / school_admin
//   権限の通常 transaction では SELECT に出てこない。
//   よって閲覧者の通常 trx とは別に withSystemAdmin trx を 1 回挟んで読む。
//
// 用途: PublicTimelineRail の AI 風表示判定 (system_admin 兼任アカウントの投稿を
// AI 週次日誌 β カードに切り替える)。
import { and, eq, inArray } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import { withSystemAdmin } from '@/shared/lib/db';
import { userTenantRoles } from '@/db/schema';
import type * as schema from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

// 内部 lookup 用の固定 user_id (実在しない zero UUID)。
// withSystemAdmin は app.user_id をセットするだけで、 system_admin 判定は app.role で行う。
// この lookup は SELECT のみで誰の代理でも操作しないため、 zero UUID で安全。
const INTERNAL_LOOKUP_USER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * 既存 transaction (system_admin RLS で実行中) から system_admin user_id 集合を取る低レイヤ実装。
 * 通常は fetchSystemAdminUserIds() を使う。 統合テストで withSystemAdminContext (テスト用 helper)
 * から直接呼ぶ用に export している。
 */
export async function selectSystemAdminUserIds(
  tx: DrizzleDb,
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set<string>();
  const rows = await tx
    .select({ userId: userTenantRoles.userId })
    .from(userTenantRoles)
    .where(
      and(
        inArray(userTenantRoles.userId, userIds),
        eq(userTenantRoles.role, 'system_admin'),
      ),
    );
  return new Set(rows.map((r) => r.userId));
}

/**
 * 渡された user_id 集合のうち、 system_admin ロールを持っているものを返す。
 * withSystemAdmin で別 transaction を開いて RLS bypass で SELECT する (本番 handler 用)。
 */
export async function fetchSystemAdminUserIds(
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set<string>();
  return withSystemAdmin(INTERNAL_LOOKUP_USER_ID, async (tx) => {
    return selectSystemAdminUserIds(tx, userIds);
  });
}
