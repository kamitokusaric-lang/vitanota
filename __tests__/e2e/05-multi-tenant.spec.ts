// Step 16b - Spec 05: マルチテナント隔離 (論点 H のブラウザ層検証)
// integration-test-plan.md Suite 2 のブラウザ版
// SP-U02-04 8 層防御がブラウザ→API→DB の全層で機能することを検証
import { test, expect } from '@playwright/test';
import { SeedClient } from './helpers/seed';
import { loginAs } from './helpers/auth';

test.describe('マルチテナント隔離 (論点 H ブラウザ層)', () => {
  test('テナント A の教員はテナント B の公開エントリにアクセスできない', async ({ page, context, request }) => {
    const seed = new SeedClient(request);
    await seed.reset();
    const tenantA = await seed.createTenant('学校 A');
    const tenantB = await seed.createTenant('学校 B');
    const userA = await seed.createUser(tenantA.id, 'teacher', { email: 'a@test.example.com', name: 'A' });
    const userB = await seed.createUser(tenantB.id, 'teacher', { email: 'b@test.example.com', name: 'B' });

    const entryB = await seed.createEntry({
      tenantId: tenantB.id,
      userId: userB.id,
      content: 'B の公開エントリ',
      isPublic: true,
    });

    await loginAs(context, seed, userA, tenantA.id);

    // 共有タイムラインに B の投稿は出ない
    await page.goto('/journal');
    await expect(page.getByText('B の公開エントリ')).not.toBeVisible();

    // 直接 URL で B のエントリ詳細にアクセスしても 404
    const editRes = await context.request.get(`/api/private/journal/entries/${entryB.id}`);
    expect(editRes.status()).toBe(404);
  });

  test('テナント A の教員はテナント B の非公開エントリも見えない', async ({ context, request }) => {
    const seed = new SeedClient(request);
    await seed.reset();
    const tenantA = await seed.createTenant('学校 A');
    const tenantB = await seed.createTenant('学校 B');
    const userA = await seed.createUser(tenantA.id, 'teacher', { email: 'a@test.example.com', name: 'A' });
    const userB = await seed.createUser(tenantB.id, 'teacher', { email: 'b@test.example.com', name: 'B' });

    const entryB_priv = await seed.createEntry({
      tenantId: tenantB.id,
      userId: userB.id,
      content: 'B の非公開',
      isPublic: false,
    });

    await loginAs(context, seed, userA, tenantA.id);

    const res = await context.request.get(`/api/private/journal/entries/${entryB_priv.id}`);
    expect(res.status()).toBe(404);
  });

  test('テナント A の教員はテナント B のエントリを更新できない', async ({ context, request }) => {
    const seed = new SeedClient(request);
    await seed.reset();
    const tenantA = await seed.createTenant('学校 A');
    const tenantB = await seed.createTenant('学校 B');
    const userA = await seed.createUser(tenantA.id, 'teacher', { email: 'a@test.example.com', name: 'A' });
    const userB = await seed.createUser(tenantB.id, 'teacher', { email: 'b@test.example.com', name: 'B' });

    const entryB = await seed.createEntry({
      tenantId: tenantB.id,
      userId: userB.id,
      content: 'B のエントリ',
      isPublic: true,
    });

    await loginAs(context, seed, userA, tenantA.id);

    const res = await context.request.put(`/api/private/journal/entries/${entryB.id}`, {
      data: { content: 'hacked' },
    });
    expect(res.status()).toBe(404);
  });

  test('テナント A の教員はテナント B のエントリを削除できない', async ({ context, request }) => {
    const seed = new SeedClient(request);
    await seed.reset();
    const tenantA = await seed.createTenant('学校 A');
    const tenantB = await seed.createTenant('学校 B');
    const userA = await seed.createUser(tenantA.id, 'teacher', { email: 'a@test.example.com', name: 'A' });
    const userB = await seed.createUser(tenantB.id, 'teacher', { email: 'b@test.example.com', name: 'B' });

    const entryB = await seed.createEntry({
      tenantId: tenantB.id,
      userId: userB.id,
      content: 'B のエントリ',
      isPublic: false,
    });

    await loginAs(context, seed, userA, tenantA.id);

    const res = await context.request.delete(`/api/private/journal/entries/${entryB.id}`);
    expect(res.status()).toBe(404);
  });
});
