// Dev-only: ワンクリックログイン API
// NODE_ENV=development でのみ動作。セッションを DB に作成し cookie をセットする。
// ⚠️ withSystemAdmin で RLS バイパス — NODE_ENV ガードが唯一の防御線
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { withSystemAdmin } from '@/shared/lib/db';
import { sessions, users, userTenantRoles, tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';

const loginSchema = z.object({
  userId: z.string().uuid(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // ★ 本番保護: development 以外では 404
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).end();
  }

  if (req.method === 'GET') {
    // ユーザー一覧を返す（dev login ページ用）
    const allUsers = await withSystemAdmin('dev-login', async (db) => {
      return db
        .select({
          userId: users.id,
          email: users.email,
          name: users.name,
          tenantId: userTenantRoles.tenantId,
          role: userTenantRoles.role,
          tenantName: tenants.name,
        })
        .from(users)
        .innerJoin(userTenantRoles, eq(userTenantRoles.userId, users.id))
        .leftJoin(tenants, eq(tenants.id, userTenantRoles.tenantId));
    });

    return res.status(200).json({ users: allUsers });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR' });
  }

  const { userId } = parsed.data;

  const sessionToken = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

  let redirectTo = '/';

  await withSystemAdmin('dev-login', async (db) => {
    // テナント ID とロールを取得
    const roles = await db
      .select({ tenantId: userTenantRoles.tenantId, role: userTenantRoles.role })
      .from(userTenantRoles)
      .where(eq(userTenantRoles.userId, userId));

    const tenantId = roles.find((r) => r.tenantId !== null)?.tenantId ?? null;
    const roleNames = roles.map((r) => r.role);

    // ロールに応じたリダイレクト先
    if (roleNames.includes('school_admin')) {
      redirectTo = '/dashboard/admin';
    } else if (roleNames.includes('teacher')) {
      redirectTo = '/journal';
    }

    // セッション作成
    await db.insert(sessions).values({
      sessionToken,
      userId,
      activeTenantId: tenantId,
      expires,
    });
  });

  // cookie をセット（Auth.js と同じ名前）
  res.setHeader(
    'Set-Cookie',
    `next-auth.session-token=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}`
  );

  return res.status(200).json({ ok: true, redirectTo });
}
