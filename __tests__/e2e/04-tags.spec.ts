// Step 16b - Spec 04: タグ関連 (US-T-013, US-T-021)
// 2026-05-18 update:
//   - /journal/new 廃止 → /dashboard 上で quick-record-tweet → Modal の EntryForm (TagFilter 内蔵)
//   - migration 0016 で tags → emotion_tags rename + context タグ廃止 (task_categories に移譲)
//   - 「感情タグと業務タグが視覚的に区別される」test は業務タグ概念が emotion_tags 側に存在しないため
//     現行ドメインで成立せず .skip() で温存 (将来 task_categories 統合時に復活検討)
import { test, expect } from '@playwright/test';
import { SeedClient } from './helpers/seed';
import { loginAs } from './helpers/auth';

test.describe('タグ関連 (US-T-013 / US-T-021)', () => {
  test.beforeEach(async ({ request, context }) => {
    const seed = new SeedClient(request);
    await seed.reset();
    const tenant = await seed.createTenant('学校 A');
    const user = await seed.createUser(tenant.id, 'teacher');

    // テナント内に複数の感情タグを準備
    // (2026-05-18: 旧 context タグは migration 0016 で task_categories に移譲済、
    //  emotion_tags は emotion 専用。 spec の '授業準備' は便宜上 neutral カテゴリで保持)
    await seed.createTag({ tenantId: tenant.id, userId: user.id, name: 'うれしい', category: 'positive' });
    await seed.createTag({ tenantId: tenant.id, userId: user.id, name: 'つかれた', category: 'negative' });
    await seed.createTag({ tenantId: tenant.id, userId: user.id, name: '授業準備', category: 'neutral' });

    await loginAs(context, seed, user, tenant.id);
  });

  test('エントリ作成画面でタグ一覧が表示される', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('quick-record-tweet').click();
    await expect(page.getByTestId('tag-filter')).toBeVisible();
    await expect(page.getByText('うれしい')).toBeVisible();
    await expect(page.getByText('つかれた')).toBeVisible();
    await expect(page.getByText('授業準備')).toBeVisible();
  });

  test.skip('感情タグと業務タグが視覚的に区別される', async ({ page }) => {
    // 2026-05-18: 業務タグ (context) は migration 0016 で emotion_tags から外され
    // task_categories に移譲。 emotion_tags 内では全てが感情カテゴリで「業務タグ」概念が
    // 存在しないため、 このテストは現行ドメインで意味を持たない。
    // 将来 task_categories と統合した tag-filter UI を作る場合に復活検討。
    await page.goto('/dashboard');
    await page.getByTestId('quick-record-tweet').click();
    const emotionTag = page.locator('button[data-testid^="tag-filter-"]').filter({ hasText: 'うれしい' });
    const taskTag = page.locator('button[data-testid^="tag-filter-"]').filter({ hasText: '授業準備' });
    await expect(emotionTag).toBeVisible();
    await expect(taskTag).toBeVisible();
  });

  test('タグを選択してエントリ投稿し、マイノートに表示される', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('quick-record-tweet').click();
    await page.getByTestId('entry-form-content-input').fill('うれしいことがあった');

    // タグを選択
    const emotionTag = page.locator('button[data-testid^="tag-filter-"]').filter({ hasText: 'うれしい' });
    await emotionTag.click();

    // 選択件数カウンターが表示される
    await expect(page.getByTestId('tag-filter-count')).toContainText('1 件選択中');

    await page.getByTestId('entry-form-submit-button').click();
    await expect(page.getByTestId('entry-form')).not.toBeVisible();

    // 2026-05-21 update: notes タブ配下の subtab 廃止 (TimelineTab がマイノート単独画面)
    await page.goto('/dashboard?tab=notes');
    await expect(page.getByText('うれしいことがあった')).toBeVisible();
  });

  test('複数タグを選択できる', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('quick-record-tweet').click();
    await page.getByTestId('entry-form-content-input').fill('複数タグ');
    await page.locator('button[data-testid^="tag-filter-"]').filter({ hasText: 'うれしい' }).click();
    await page.locator('button[data-testid^="tag-filter-"]').filter({ hasText: '授業準備' }).click();
    await expect(page.getByTestId('tag-filter-count')).toContainText('2 件選択中');
  });

  test('タグの再クリックで選択解除される', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('quick-record-tweet').click();
    const emotionTag = page.locator('button[data-testid^="tag-filter-"]').filter({ hasText: 'うれしい' });
    await emotionTag.click();
    await expect(page.getByTestId('tag-filter-count')).toContainText('1 件選択中');
    await emotionTag.click();
    // カウンターは 0 になる→非表示 or 0 表示
    // 実装は selectedTagIds.length > 0 のときのみカウンター表示
    await expect(page.getByTestId('tag-filter-count')).not.toBeVisible();
  });
});
