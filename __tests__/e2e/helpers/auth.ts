// Step 16b: E2E 認証ヘルパー
// /api/test/_seed の createSession で sessions テーブルに直接行を作り、
// next-auth.session-token Cookie を Playwright コンテキストに注入する
import type { BrowserContext } from '@playwright/test';
import type { SeedClient, SeedUser } from './seed';

export interface AuthFixture {
  user: SeedUser;
  sessionToken: string;
}

/**
 * テストユーザーとしてログイン状態を作る
 * NextAuth の認証フローを通さず、sessions テーブルに直接 INSERT + Cookie 注入
 */
export async function loginAs(
  context: BrowserContext,
  seed: SeedClient,
  user: SeedUser,
  tenantId: string,
  baseUrl = 'http://localhost:3000'
): Promise<AuthFixture> {
  const { sessionToken, expires } = await seed.createSession(user.id, tenantId);

  const url = new URL(baseUrl);
  await context.addCookies([
    {
      name: 'next-auth.session-token',
      value: sessionToken,
      domain: url.hostname,
      path: '/',
      expires: Math.floor(new Date(expires).getTime() / 1000),
      httpOnly: true,
      sameSite: 'Lax',
      secure: false, // ローカル http のため
    },
  ]);

  return { user, sessionToken };
}

/**
 * ログアウト状態にする (Cookie をクリア)
 */
export async function logout(context: BrowserContext): Promise<void> {
  await context.clearCookies();
}
