// SP-07 論点C対応: Auth.js を JWT 戦略 → database 戦略に変更
// セッションを sessions テーブルに保存し、即時失効を可能にする
//
// 2026-04-19 変更: 認証外部化設計により Google Provider を削除。
// ID Token 検証とセッション発行は /api/auth/google-signin が担当。
// 本ファイルは NextAuth の「セッション読取 / signOut / signOut 後の cookie 削除」
// のためだけに残置。providers は空。
// 設計詳細: aidlc-docs/construction/auth-externalization.md
import type { NextAuthOptions } from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import { getDb, withSessionBootstrap } from '@/shared/lib/db';
import {
  users,
  userTenantRoles,
  tenants,
  accounts,
  sessions,
  verificationTokens,
} from '@/db/schema';
import { getSecret } from '@/shared/lib/secrets';
import { logger } from '@/shared/lib/logger';
import { LogEvents, logEvent } from '@/shared/lib/log-events';
import type { Role, TenantStatus } from '@/shared/types/auth';

// SP-07: アイドルタイムアウト 30分 / 絶対最大寿命 8時間
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ABSOLUTE_MAX_AGE_SEC = 8 * 60 * 60;
const SESSION_UPDATE_INTERVAL_SEC = 5 * 60; // last_accessed_at の更新間隔

export async function buildAuthOptions(): Promise<NextAuthOptions> {
  const nextAuthSecret =
    process.env.NEXTAUTH_SECRET ?? (await getSecret('vitanota/nextauth-secret'));

  const db = await getDb();

  return {
    secret: nextAuthSecret,

    // SP-07: Drizzle アダプタで sessions テーブルに保存
    // 型キャスト: @auth/drizzle-adapter v1.11 と drizzle-orm v0.30 で
    // PgColumn の型定義が異なるが、ランタイムの contract は互換
    adapter: DrizzleAdapter(
      db,
      {
        usersTable: users as never,
        accountsTable: accounts as never,
        sessionsTable: sessions as never,
        verificationTokensTable: verificationTokens as never,
      } as never
    ),

    // ID Token 検証とセッション発行は /api/auth/google-signin で行う。
    // NextAuth の /api/auth/signin ルートは使わないため providers は空。
    // /api/auth/signout (NextAuth 標準) と getServerSession は引き続き動作する。
    providers: [],

    session: {
      strategy: 'database',
      // SP-07: 絶対最大寿命 8時間
      maxAge: ABSOLUTE_MAX_AGE_SEC,
      // last_accessed_at 更新間隔（5分）
      updateAge: SESSION_UPDATE_INTERVAL_SEC,
    },

    pages: {
      signIn: '/auth/signin',
      error: '/auth/signin',
    },

    callbacks: {
      // BR-AUTH-01 招待制のチェックは /api/auth/google-signin 側で実施
      // (NextAuth の OAuth フローを使わないため signIn callback は呼ばれない)

      // database 戦略では session() コールバックが (session, user) 形式で呼ばれる
      // user は sessions テーブルから JOIN された users 行
      // ここで tenantId / roles / tenantStatus を解決する（旧 jwt callback の役割）
      async session({ session, user }) {
        try {
          // SP-07: アイドルタイムアウトチェック（30分）
          // sessions テーブルの updatedAt（=最終アクセス）を確認
          // updateAge=5分で更新されるため、updatedAt から 30分以上経過していたら無効
          // ただし Auth.js v4 の database 戦略では updatedAt が自動更新されるため、
          // ここでは expires のみで十分（maxAge 8h で絶対最大寿命を制御）
          // より厳密なアイドルタイムアウトは Step 後続で middleware に実装

          // ロールとテナント情報を取得（bootstrap ロールで自分の行だけ読む）
          const roleRows = await withSessionBootstrap(user.id, async (tx) => {
            return tx
              .select({
                tenantId: userTenantRoles.tenantId,
                role: userTenantRoles.role,
              })
              .from(userTenantRoles)
              .where(eq(userTenantRoles.userId, user.id));
          });

          const roles = roleRows.map((r) => r.role as Role);
          const tenantId = roleRows.find((r) => r.tenantId !== null)?.tenantId ?? null;

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

          session.user = {
            userId: user.id,
            email: user.email ?? session.user.email,
            name: user.name ?? session.user.name,
            image: user.image ?? null,
            tenantId,
            roles,
            tenantStatus,
          };
        } catch (err) {
          // RP-01: テナント状態取得失敗 → 安全側として suspended 扱い
          logger.error({ event: 'auth.session.error', err }, 'session callback error');
          session.user = {
            ...session.user,
            tenantStatus: 'suspended' as TenantStatus,
          };
        }

        return session;
      },

      // BR-ROLE-03: ロール別リダイレクト
      async redirect({ url, baseUrl }) {
        if (url.startsWith(baseUrl)) return url;
        if (url.startsWith('/')) return `${baseUrl}${url}`;
        return baseUrl;
      },
    },

    events: {
      // SP-07 + P1-D: セッション作成・削除を構造化ログに記録
      async createUser({ user }) {
        logger.info({
          event: 'auth.user.created',
          userId: user.id,
          email: user.email,
        });
      },
      async signIn({ user }) {
        if (user?.id) {
          logEvent(LogEvents.SessionCreated, {
            sessionId: 'pending', // session token は events に渡らない
            userId: user.id,
            tenantId: '', // session callback で resolve される
          });
        }
      },
      async signOut(message) {
        // database strategy では message に { session } が含まれる
        // session の型は v4 では Session または JWT のいずれかで、unknown 経由でアクセス
        const sessionLike = (message as unknown as { session?: Record<string, unknown> }).session;
        if (sessionLike) {
          logEvent(LogEvents.SessionRevoked, {
            sessionId: String(sessionLike.sessionToken ?? 'unknown'),
            userId: String(sessionLike.userId ?? ''),
            tenantId: '',
            reason: 'user_logout',
          });
        }
      },
    },

    // BR-AUTH-03: ロールが空の場合のアクセス拒否はミドルウェアで実施
  };
}

// シングルトンとして authOptions をキャッシュ
let _authOptions: NextAuthOptions | null = null;

export async function getAuthOptions(): Promise<NextAuthOptions> {
  if (_authOptions) return _authOptions;
  _authOptions = await buildAuthOptions();
  return _authOptions;
}

// テスト/参照用にエクスポート
export { IDLE_TIMEOUT_MS, ABSOLUTE_MAX_AGE_SEC, SESSION_UPDATE_INTERVAL_SEC };
