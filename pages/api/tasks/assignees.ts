// GET /api/tasks/assignees - tenant 内の teacher + school_admin 一覧 (アサイン UI 用)
import type { NextApiRequest, NextApiResponse } from 'next';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { users, userTenantRoles } from '@/db/schema';
import { logger } from '@/shared/lib/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  try {
    const assignees = await withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        return tx
          .selectDistinct({
            userId: users.id,
            name: users.name,
            email: users.email,
          })
          .from(users)
          .innerJoin(
            userTenantRoles,
            and(
              eq(userTenantRoles.userId, users.id),
              eq(userTenantRoles.tenantId, ctx.tenantId),
              inArray(userTenantRoles.role, ['teacher', 'school_admin']),
            ),
          )
          .where(isNull(users.deletedAt));
      },
    );
    return res.status(200).json({ assignees });
  } catch (err) {
    logger.error({ event: 'tasks.assignees.error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
