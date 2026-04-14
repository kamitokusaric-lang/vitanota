// BP-01 ログインフロー / BR-AUTH-01〜04 実装
import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { eq, and, isNull } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { users, userTenantRoles, tenants, accounts, invitationTokens } from '@/db/schema';
import { getSecret } from '@/shared/lib/secrets';
import { logger } from '@/shared/lib/logger';
import type { Role, TenantStatus } from '@/shared/types/auth';

export async function buildAuthOptions(): Promise<NextAuthOptions> {
  // ローカル開発では環境変数から直接取得、本番では Secrets Manager から取得
  const nextAuthSecret =
    process.env.NEXTAUTH_SECRET ?? (await getSecret('vitanota/nextauth-secret'));
  const googleClientId =
    process.env.GOOGLE_CLIENT_ID ?? (await getSecret('vitanota/google-client-id'));
  const googleClientSecret =
    process.env.GOOGLE_CLIENT_SECRET ?? (await getSecret('vitanota/google-client-secret'));

  return {
    secret: nextAuthSecret,

    providers: [
      GoogleProvider({
        clientId: googleClientId,
        clientSecret: googleClientSecret,
      }),
    ],

    session: {
      strategy: 'jwt',
      // BR-AUTH-02: 最終アクティビティから 24時間（スライディングウィンドウ）
      maxAge: 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    },

    pages: {
      signIn: '/auth/signin',
      error: '/auth/signin',
    },

    callbacks: {
      // BR-AUTH-01: 招待なし登録禁止
      // users テーブルに存在しない場合はログイン拒否
      async signIn({ user, account }) {
        if (!user.email) return false;

        try {
          // 招待フロー経由のサインアップ（/auth/invite から inviteToken がセッションに付与される）
          // ここでは既存ユーザーのログインチェックのみ行う
          const db = await getDb();

          const [existingUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, user.email))
            .limit(1);

          if (!existingUser) {
            logger.warn({
              event: 'auth.login.failed',
              reason: 'user_not_found',
            });
            return false;
          }

          // OAuth アカウントの upsert（Auth.js は通常これを自動で行うが、
          // カスタムDB使用時は明示的に管理する）
          if (account) {
            const [existingAccount] = await db
              .select({ id: accounts.id })
              .from(accounts)
              .where(
                and(
                  eq(accounts.provider, account.provider),
                  eq(accounts.providerAccountId, account.providerAccountId)
                )
              )
              .limit(1);

            if (!existingAccount) {
              await db.insert(accounts).values({
                userId: existingUser.id,
                type: account.type,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                accessToken: account.access_token ?? null,
                refreshToken: account.refresh_token ?? null,
                expiresAt: account.expires_at ?? null,
                tokenType: account.token_type ?? null,
                scope: account.scope ?? null,
                idToken: account.id_token ?? null,
              });
            }
          }

          logger.info({ event: 'auth.login.success' });
          return true;
        } catch (err) {
          logger.error({ event: 'auth.login.error', err }, 'signIn callback error');
          return false;
        }
      },

      // JWT コールバック: userId・tenantId・roles・tenantStatus を JWT に付与
      async jwt({ token, user }) {
        // 初回ログイン時（user が存在する）
        if (user?.email) {
          try {
            const db = await getDb();

            const [dbUser] = await db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.email, user.email))
              .limit(1);

            if (!dbUser) {
              logger.warn({ event: 'auth.jwt.user_not_found' });
              return token;
            }

            // ロールとテナント情報を取得
            const roleRows = await db
              .select({
                tenantId: userTenantRoles.tenantId,
                role: userTenantRoles.role,
              })
              .from(userTenantRoles)
              .where(eq(userTenantRoles.userId, dbUser.id));

            const roles = roleRows.map((r) => r.role as Role);

            // 最初のテナント ID を使用（system_admin の場合は null）
            const tenantId =
              roleRows.find((r) => r.tenantId !== null)?.tenantId ?? null;

            // テナント状態を取得
            let tenantStatus: TenantStatus | null = null;
            if (tenantId) {
              const [tenant] = await db
                .select({ status: tenants.status })
                .from(tenants)
                .where(eq(tenants.id, tenantId))
                .limit(1);
              tenantStatus = (tenant?.status as TenantStatus) ?? null;
            }

            token.userId = dbUser.id;
            token.tenantId = tenantId;
            token.roles = roles;
            token.tenantStatus = tenantStatus;
          } catch (err) {
            logger.error({ event: 'auth.jwt.error', err }, 'JWT callback error');
          }
        }

        // セッション更新時: tenantStatus を最新化（停止を即時反映）
        if (token.tenantId && !user) {
          try {
            const db = await getDb();
            const [tenant] = await db
              .select({ status: tenants.status })
              .from(tenants)
              .where(eq(tenants.id, token.tenantId))
              .limit(1);
            token.tenantStatus = (tenant?.status as TenantStatus) ?? null;
          } catch {
            // RP-01: テナント状態取得失敗 → 停止中として扱う
            token.tenantStatus = 'suspended';
          }
        }

        return token;
      },

      // セッションコールバック: JWT ペイロードをセッションに反映
      async session({ session, token }) {
        session.user = {
          userId: token.userId as string,
          email: token.email ?? session.user.email,
          name: token.name ?? session.user.name,
          image: token.picture ?? null,
          tenantId: token.tenantId as string | null,
          roles: (token.roles as Role[]) ?? [],
          tenantStatus: token.tenantStatus as TenantStatus | null,
        };
        return session;
      },

      // BR-ROLE-03: ロール別リダイレクト
      async redirect({ url, baseUrl }) {
        if (url.startsWith(baseUrl)) return url;
        if (url.startsWith('/')) return `${baseUrl}${url}`;
        return baseUrl;
      },
    },

    // BR-AUTH-03: ロールが空の場合のアクセス拒否はミドルウェアで実施
  };
}

// シングルトンとして authOptions をキャッシュ（サーバー起動時に一度だけ構築）
let _authOptions: NextAuthOptions | null = null;

export async function getAuthOptions(): Promise<NextAuthOptions> {
  if (_authOptions) return _authOptions;
  _authOptions = await buildAuthOptions();
  return _authOptions;
}
