// 招待経由サインアップエンドポイント: ID Token + 招待 token を受けて users 作成・
// user_tenant_roles 付与・invitation 消費・セッション発行を単一トランザクションで処理する。
//
// 既存 /api/auth/google-signin は「登録済みユーザーのログイン」専用、
// /api/invitations/[token] POST は「既セッション保持者の承諾 (現状到達不可)」用。
// 未登録ユーザーの招待承諾経路はこのエンドポイントが担当する。
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { withSystemAdmin } from '@/shared/lib/db';
import { invitationTokens, sessions, userTenantRoles, users } from '@/db/schema';
import { verifyGoogleIdToken } from '@/features/auth/lib/verifyGoogleIdToken';
import { logger } from '@/shared/lib/logger';

const requestSchema = z.object({
  idToken: z.string().min(10),
  inviteToken: z.string().length(64),
});

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR' });
  }
  const { idToken, inviteToken } = parsed.data;

  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) {
    logger.error({
      event: 'auth.config.missing',
      detail: 'GOOGLE_CLIENT_ID env var not set',
    });
    return res.status(500).json({ error: 'SERVER_CONFIG_ERROR' });
  }

  let email: string;
  let name: string | null;
  let image: string | null;
  try {
    const payload = await verifyGoogleIdToken(idToken, audience);
    email = payload.email;
    name = payload.name ?? null;
    image = payload.picture ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ event: 'auth.idtoken.verify.failed', err: message });
    return res.status(401).json({ error: 'INVALID_TOKEN' });
  }

  type AcceptResult =
    | { kind: 'ok'; userId: string; tenantId: string }
    | { kind: 'invalid' }
    | { kind: 'email_mismatch' };

  const result = await withSystemAdmin<AcceptResult>('accept-invite', async (db) => {
    const [invitation] = await db
      .select({
        id: invitationTokens.id,
        email: invitationTokens.email,
        role: invitationTokens.role,
        tenantId: invitationTokens.tenantId,
      })
      .from(invitationTokens)
      .where(
        and(
          eq(invitationTokens.token, inviteToken),
          isNull(invitationTokens.usedAt),
          gt(invitationTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!invitation) return { kind: 'invalid' };
    if (invitation.email !== email) return { kind: 'email_mismatch' };

    const [inserted] = await db
      .insert(users)
      .values({
        email,
        name,
        image,
        emailVerified: new Date(),
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });

    let userId: string;
    if (inserted) {
      userId = inserted.id;
    } else {
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      userId = existing.id;
    }

    await db
      .insert(userTenantRoles)
      .values({
        userId,
        tenantId: invitation.tenantId,
        role: invitation.role,
      })
      .onConflictDoNothing();

    await db
      .update(invitationTokens)
      .set({ usedAt: new Date() })
      .where(eq(invitationTokens.id, invitation.id));

    return { kind: 'ok', userId, tenantId: invitation.tenantId };
  });

  if (result.kind === 'invalid') {
    logger.warn({ event: 'auth.accept.invalid', email });
    return res.status(410).json({ error: 'INVITE_INVALID' });
  }
  if (result.kind === 'email_mismatch') {
    logger.warn({ event: 'auth.accept.email_mismatch', email });
    return res.status(403).json({ error: 'EMAIL_MISMATCH' });
  }

  const sessionToken = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_MAX_AGE_MS);

  await withSystemAdmin('accept-invite-session', async (db) => {
    await db.insert(sessions).values({
      sessionToken,
      userId: result.userId,
      activeTenantId: result.tenantId,
      expires,
    });
  });

  const useSecure = process.env.NEXTAUTH_URL?.startsWith('https://') ?? false;
  const cookieName = useSecure
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';
  const cookieAttrs = [
    `${cookieName}=${sessionToken}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expires.toUTCString()}`,
  ];
  if (useSecure) cookieAttrs.push('Secure');

  res.setHeader('Set-Cookie', cookieAttrs.join('; '));

  logger.info({ event: 'auth.accept.success', userId: result.userId });
  return res.status(200).json({ ok: true });
}
