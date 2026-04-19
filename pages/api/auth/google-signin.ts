// Google ID Token → セッション発行エンドポイント
//
// フロントが @react-oauth/google SDK で取得した ID Token を受け取り、
// バンドル済み JWKS でローカル検証して sessions テーブルにセッションを作成する。
// Google への外部通信は発生しない。
//
// 設計詳細: aidlc-docs/construction/auth-externalization.md
//
// セキュリティチェック 3 層:
//   1. JWT 署名・iss・aud・exp 検証 (verifyGoogleIdToken)
//   2. email_verified === true (verifyGoogleIdToken 内)
//   3. users テーブル照合 (BR-AUTH-01 招待制・deleted_at NULL)
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { withSystemAdmin } from '@/shared/lib/db';
import { sessions, users, userTenantRoles } from '@/db/schema';
import { verifyGoogleIdToken } from '@/features/auth/lib/verifyGoogleIdToken';
import { logger } from '@/shared/lib/logger';

const requestSchema = z.object({
  idToken: z.string().min(10),
});

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // SP-07: 絶対最大寿命 8 時間

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  // ── リクエスト検証 ──
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR' });
  }
  const { idToken } = parsed.data;

  // ── ID Token 検証（署名・iss・aud・exp・email_verified） ──
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) {
    logger.error({
      event: 'auth.config.missing',
      detail: 'GOOGLE_CLIENT_ID env var not set',
    });
    return res.status(500).json({ error: 'SERVER_CONFIG_ERROR' });
  }

  let email: string;
  try {
    const payload = await verifyGoogleIdToken(idToken, audience);
    email = payload.email;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ event: 'auth.idtoken.verify.failed', err: message });
    return res.status(401).json({ error: 'INVALID_TOKEN' });
  }

  // ── ユーザー検索 + テナント解決（BR-AUTH-01 招待制） ──
  const userInfo = await withSystemAdmin('google-signin-lookup', async (db) => {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    if (!user) return null;

    const roles = await db
      .select({ tenantId: userTenantRoles.tenantId })
      .from(userTenantRoles)
      .where(eq(userTenantRoles.userId, user.id));

    const tenantId = roles.find((r) => r.tenantId !== null)?.tenantId ?? null;
    return { id: user.id, tenantId };
  });

  if (!userInfo) {
    logger.warn({
      event: 'auth.login.failed',
      reason: 'not_invited',
      email,
    });
    return res.status(403).json({ error: 'NOT_INVITED' });
  }

  // ── セッション発行 ──
  const sessionToken = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_MAX_AGE_MS);

  await withSystemAdmin('google-signin-session', async (db) => {
    await db.insert(sessions).values({
      sessionToken,
      userId: userInfo.id,
      activeTenantId: userInfo.tenantId,
      expires,
    });
  });

  // ── Cookie 設定（NextAuth 互換・middleware が同 cookie 名を読む） ──
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

  logger.info({ event: 'auth.login.success', userId: userInfo.id });
  return res.status(200).json({ ok: true });
}
