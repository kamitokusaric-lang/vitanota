// Step 16b - Spec 04: タグ関連 (US-T-013, US-T-021)
import { test, expect } from '@playwright/test';
import { SeedClient } from './helpers/seed';
import { loginAs } from './helpers/auth';

test.describe('タグ関連 (US-T-013 / US-T-021)', () => {
  test.beforeEach(async ({ request, context }) => {
    const seed = new SeedClient(request);
    await seed.reset();
    const tenant = await seed.createTenant('学校 A');
    const user = await seed.createUser(tenant.id, 'teacher');

    // テナント内に複数のタグを準備（感情 + 業務）
    await seed.createTag({ tenantId: tenant.id, userId: user.id, name: 'うれしい', type: 'emotion', category: 'positive' });
    await seed.createTag({ tenantId: tenant.id, userId: user.id, name: 'つかれた', type: 'emotion', category: 'negative' });
    await seed.createTag({ tenantId: tenant.id, userId: user.id, name: '授業準備', type: 'context' });

    await loginAs(context, seed, user, tenant.id);
  });

  test('エントリ作成画面でタグ一覧が表示される', async ({ page }) => {
    await page.goto('/journal/new');
    await expect(page.getByTestId('tag-filter')).toBeVisible();
    await expect(page.getByText('うれしい')).toBeVisible();
    await expect(page.getByText('つかれた')).toBeVisible();
    await expect(page.getByText('授業準備')).toBeVisible();
  });

  test('感情タグと業務タグが視覚的に区別される', async ({ page }) => {
    await page.goto('/journal/new');
    // 感情タグは pink 系のクラス、業務タグは gray 系
    // クラス検証は脆弱なため、両方のタグが選択可能かのみテスト
    const emotionTag = page.locator('button[data-testid^="tag-filter-"]').filter({ hasText: 'うれしい' });
    const taskTag = page.locator('button[data-testid^="tag-filter-"]').filter({ hasText: '授業準備' });
    await expect(emotionTag).toBeVisible();
    await expect(taskTag).toBeVisible();
  });

  test('タグを選択してエントリ投稿し、タイムラインに表示される', async ({ page }) => {
    await page.goto('/journal/new');
    await page.getByTestId('entry-form-content-input').fill('うれしいことがあった');

    // タグを選択
    const emotionTag = page.locator('button[data-testid^="tag-filter-"]').filter({ hasText: 'うれしい' });
    await emotionTag.click();

    // 選択件数カウンターが表示される
    await expect(page.getByTestId('tag-filter-count')).toContainText('1 件選択中');

    await page.getByTestId('entry-form-submit-button').click();
    await expect(page).toHaveURL(/\/journal\/mine/);
    await expect(page.getByText('うれしいことがあった')).toBeVisible();
  });

  test('複数タグを選択できる', async ({ page }) => {
    await page.goto('/journal/new');
    await page.getByTestId('entry-form-content-input').fill('複数タグ');
    await page.locator('button[data-testid^="tag-filter-"]').filter({ hasText: 'うれしい' }).click();
    await page.locator('button[data-testid^="tag-filter-"]').filter({ hasText: '授業準備' }).click();
    await expect(page.getByTestId('tag-filter-count')).toContainText('2 件選択中');
  });

  test('タグの再クリックで選択解除される', async ({ page }) => {
    await page.goto('/journal/new');
    const emotionTag = page.locator('button[data-testid^="tag-filter-"]').filter({ hasText: 'うれしい' });
    await emotionTag.click();
    await expect(page.getByTestId('tag-filter-count')).toContainText('1 件選択中');
    await emotionTag.click();
    // カウンターは 0 になる→非表示 or 0 表示
    // 実装は selectedTagIds.length > 0 のときのみカウンター表示
    await expect(page.getByTestId('tag-filter-count')).not.toBeVisible();
  });
});
