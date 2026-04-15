// Step 16b - Spec 03: 共有タイムライン (US-T-014)
// stories.md 改訂版: 共有タイムラインはテナント内全教員の公開エントリを表示
import { test, expect } from '@playwright/test';
import { SeedClient } from './helpers/seed';
import { loginAs } from './helpers/auth';

test.describe('共有タイムライン (US-T-014)', () => {
  test('テナント内の他教員の公開エントリが表示される', async ({ page, context, request }) => {
    const seed = new SeedClient(request);
    await seed.reset();

    const tenant = await seed.createTenant('学校 A');
    const userA = await seed.createUser(tenant.id, 'teacher', { email: 'teacherA@test.example.com', name: '教員 A' });
    const userB = await seed.createUser(tenant.id, 'teacher', { email: 'teacherB@test.example.com', name: '教員 B' });

    // 教員 B が公開エントリを作成
    await seed.createEntry({
      tenantId: tenant.id,
      userId: userB.id,
      content: '教員 B の公開投稿',
      isPublic: true,
    });

    // 教員 A としてログイン
    await loginAs(context, seed, userA, tenant.id);
    await page.goto('/journal');

    await expect(page.getByText('教員 B の公開投稿')).toBeVisible();
  });

  test('非公開エントリは共有タイムラインに絶対に表示されない', async ({ page, context, request }) => {
    const seed = new SeedClient(request);
    await seed.reset();
    const tenant = await seed.createTenant('学校 A');
    const userA = await seed.createUser(tenant.id, 'teacher', { email: 'a@test.example.com', name: 'A' });
    const userB = await seed.createUser(tenant.id, 'teacher', { email: 'b@test.example.com', name: 'B' });

    // 教員 B が非公開エントリを作成
    await seed.createEntry({
      tenantId: tenant.id,
      userId: userB.id,
      content: 'B の非公開記録',
      isPublic: false,
    });
    // 公開エントリも 1 件
    await seed.createEntry({
      tenantId: tenant.id,
      userId: userB.id,
      content: 'B の公開記録',
      isPublic: true,
    });

    await loginAs(context, seed, userA, tenant.id);
    await page.goto('/journal');

    await expect(page.getByText('B の公開記録')).toBeVisible();
    await expect(page.getByText('B の非公開記録')).not.toBeVisible();
  });

  test('別テナントのエントリは表示されない', async ({ page, context, request }) => {
    const seed = new SeedClient(request);
    await seed.reset();
    const tenantA = await seed.createTenant('学校 A');
    const tenantB = await seed.createTenant('学校 B');
    const userA = await seed.createUser(tenantA.id, 'teacher', { email: 'ta@test.example.com', name: 'TA' });
    const userB = await seed.createUser(tenantB.id, 'teacher', { email: 'tb@test.example.com', name: 'TB' });

    await seed.createEntry({
      tenantId: tenantB.id,
      userId: userB.id,
      content: 'テナント B の公開投稿',
      isPublic: true,
    });

    await loginAs(context, seed, userA, tenantA.id);
    await page.goto('/journal');

    await expect(page.getByTestId('timeline-list-empty')).toBeVisible();
    await expect(page.getByText('テナント B の公開投稿')).not.toBeVisible();
  });

  test('マイ記録は別ページで自分の全エントリ (公開・非公開両方) を表示', async ({ page, context, request }) => {
    const seed = new SeedClient(request);
    await seed.reset();
    const tenant = await seed.createTenant('学校 A');
    const user = await seed.createUser(tenant.id, 'teacher');

    await seed.createEntry({
      tenantId: tenant.id,
      userId: user.id,
      content: '自分の公開',
      isPublic: true,
    });
    await seed.createEntry({
      tenantId: tenant.id,
      userId: user.id,
      content: '自分の非公開',
      isPublic: false,
    });

    await loginAs(context, seed, user, tenant.id);
    await page.goto('/journal/mine');

    await expect(page.getByText('自分の公開')).toBeVisible();
    await expect(page.getByText('自分の非公開')).toBeVisible();
  });
});
