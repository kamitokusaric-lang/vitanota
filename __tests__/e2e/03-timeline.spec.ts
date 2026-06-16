// Step 16b - Spec 03: 共有タイムライン (US-T-014)
// stories.md 改訂版: 共有タイムラインはテナント内全教員の公開エントリを表示
// 2026-06-14 update (記録入力一本化): 右レーン PublicTimelineRail = 職員室ノート単独
//   (subtab 撤去)。職員室ノートは diary を除外して流す (tweet/knowledge 等)。
//   そのため「タイムラインに出る」検証用の公開エントリは kind='tweet' で seed する。
//   マイノートはトップタブ (?tab=my-notes) の MyNotesByKind (全 kind・公開非公開両方)。
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

    // 教員 B が公開エントリを作成 (職員室ノートに流すため非 diary)
    await seed.createEntry({
      tenantId: tenant.id,
      userId: userB.id,
      content: '教員 B の公開投稿',
      isPublic: true,
      kind: 'tweet',
    });

    // 教員 A としてログイン → ダッシュボード右レーン (職員室ノート)
    await loginAs(context, seed, userA, tenant.id);
    await page.goto('/dashboard');

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
    // 公開エントリも 1 件 (職員室ノートに流すため非 diary)
    await seed.createEntry({
      tenantId: tenant.id,
      userId: userB.id,
      content: 'B の公開記録',
      isPublic: true,
      kind: 'tweet',
    });

    await loginAs(context, seed, userA, tenant.id);
    await page.goto('/dashboard');

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
      kind: 'tweet',
    });

    await loginAs(context, seed, userA, tenantA.id);
    await page.goto('/dashboard');

    // 職員室ノート (default) でテナント A の公開投稿は 0 件
    await expect(page.getByTestId('public-timeline-rail-empty')).toBeVisible();
    await expect(page.getByText('テナント B の公開投稿')).not.toBeVisible();
  });

  test('マイノートは自分の全エントリ (公開・非公開両方) を表示', async ({ page, context, request }) => {
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
    // マイノートタブで自分の公開・非公開両方を確認。
    // 公開エントリは右レーン (公開タイムライン) にも出るため、マイノートパネル内にスコープして
    // strict mode 違反 (同名 2 要素) を避ける。
    await page.goto('/dashboard?tab=my-notes');

    const myNotes = page.getByTestId('tabpanel-my-notes');
    await expect(myNotes.getByText('自分の公開')).toBeVisible();
    await expect(myNotes.getByText('自分の非公開')).toBeVisible();
  });
});
