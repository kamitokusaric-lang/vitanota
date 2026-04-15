// Step 16b - Spec 01: 認証フロー
// 関連ストーリー: 認証関連 (Unit-01)
// 注: 実 OAuth フローはモックしないため、direct session injection のみ検証
import { test, expect } from '@playwright/test';
import { SeedClient } from './helpers/seed';
import { loginAs } from './helpers/auth';

test.describe('認証フロー', () => {
  test.beforeEach(async ({ request }) => {
    const seed = new SeedClient(request);
    await seed.reset();
  });

  test('未ログインで /journal にアクセスすると /auth/signin にリダイレクトされる', async ({ page }) => {
    await page.goto('/journal');
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('セッション注入後に /journal が表示される', async ({ page, context, request }) => {
    const seed = new SeedClient(request);
    const tenant = await seed.createTenant('学校 A');
    const user = await seed.createUser(tenant.id, 'teacher');

    await loginAs(context, seed, user, tenant.id);
    await page.goto('/journal');

    await expect(page.getByTestId('journal-timeline-heading')).toBeVisible();
  });

  test('セッション Cookie がない場合、API も 401 を返す', async ({ request }) => {
    const res = await request.get('/api/private/journal/entries/mine');
    expect(res.status()).toBe(401);
  });

  test('セッション Cookie 注入後、API は 200 を返す', async ({ context, request }) => {
    const seed = new SeedClient(request);
    const tenant = await seed.createTenant('学校 B');
    const user = await seed.createUser(tenant.id, 'teacher');
    await loginAs(context, seed, user, tenant.id);

    const res = await context.request.get('/api/private/journal/entries/mine');
    expect(res.status()).toBe(200);
  });
});
