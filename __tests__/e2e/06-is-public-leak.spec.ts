// Step 16b - Spec 06: SP-U02-04 8 層防御のブラウザ層検証
// is_public=false のエントリが /api/public/journal/entries に絶対に流れないことを検証
// (Layer 1-8 の最後の砦としての E2E 検証)
import { test, expect } from '@playwright/test';
import { SeedClient } from './helpers/seed';
import { loginAs } from './helpers/auth';

test.describe('SP-U02-04 is_public 漏えい防止 (E2E)', () => {
  test('100 件の非公開エントリと 5 件の公開エントリで、共有タイムラインは公開のみ返す', async ({ context, request }) => {
    const seed = new SeedClient(request);
    await seed.reset();
    const tenant = await seed.createTenant('学校 A');
    const user = await seed.createUser(tenant.id, 'teacher');

    // 非公開を 100 件
    for (let i = 0; i < 100; i++) {
      await seed.createEntry({
        tenantId: tenant.id,
        userId: user.id,
        content: `非公開 ${i}`,
        isPublic: false,
      });
    }
    // 公開を 5 件
    for (let i = 0; i < 5; i++) {
      await seed.createEntry({
        tenantId: tenant.id,
        userId: user.id,
        content: `公開 ${i}`,
        isPublic: true,
      });
    }

    await loginAs(context, seed, user, tenant.id);

    // /api/public/journal/entries の生レスポンスを検証
    const res = await context.request.get('/api/public/journal/entries?page=1&perPage=200');
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { entries: Array<Record<string, unknown>> };

    // 公開のみが返る
    expect(body.entries.length).toBeLessThanOrEqual(5);
    body.entries.forEach((entry) => {
      const content = entry.content as string;
      expect(content).toMatch(/^公開/);
      // VIEW 経由なので isPublic フィールドは含まれない
      expect(entry).not.toHaveProperty('isPublic');
    });
  });

  test('public_journal_entries VIEW のレスポンス型に isPublic フィールドが含まれない', async ({ context, request }) => {
    const seed = new SeedClient(request);
    await seed.reset();
    const tenant = await seed.createTenant('学校 A');
    const user = await seed.createUser(tenant.id, 'teacher');

    await seed.createEntry({
      tenantId: tenant.id,
      userId: user.id,
      content: '公開エントリ',
      isPublic: true,
    });

    await loginAs(context, seed, user, tenant.id);
    const res = await context.request.get('/api/public/journal/entries');
    const body = (await res.json()) as { entries: Array<Record<string, unknown>> };

    expect(body.entries).toHaveLength(1);
    // SP-U02-04 Layer 4: VIEW 定義で is_public 列を除外
    expect(body.entries[0]).not.toHaveProperty('isPublic');
    expect(body.entries[0]).toHaveProperty('id');
    expect(body.entries[0]).toHaveProperty('content');
  });

  test('Cache-Control ヘッダーが /api/public/* と /api/private/* で正しく分離されている', async ({ context, request }) => {
    const seed = new SeedClient(request);
    await seed.reset();
    const tenant = await seed.createTenant('学校 A');
    const user = await seed.createUser(tenant.id, 'teacher');
    await loginAs(context, seed, user, tenant.id);

    const publicRes = await context.request.get('/api/public/journal/entries');
    expect(publicRes.headers()['cache-control']).toContain('s-maxage');

    const privateRes = await context.request.get('/api/private/journal/entries/mine');
    expect(privateRes.headers()['cache-control']).toContain('private');
    expect(privateRes.headers()['cache-control']).toContain('no-store');
  });
});
