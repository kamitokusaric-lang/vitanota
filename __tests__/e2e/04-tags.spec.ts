// Step 16b - Spec 04: タグ関連 (US-T-013, US-T-021)
// 2026-06-25 update (UI 刷新): 日々ノート (DiaryNoteBox) はマイノートタブ
//   (?tab=my-notes) の「今日のふりかえり」インライン入力に移行。気持ちタグ (TagFilter) も
//   そこに表示される。表示確認はマイノートタブの MyNotesByKind。
//   migration 0016 で tags → emotion_tags rename + context タグ廃止 (task_categories に移譲)。
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
    await seed.createTag({ tenantId: tenant.id, userId: user.id, name: 'うれしい', category: 'positive' });
    await seed.createTag({ tenantId: tenant.id, userId: user.id, name: 'つかれた', category: 'negative' });
    await seed.createTag({ tenantId: tenant.id, userId: user.id, name: '授業準備', category: 'neutral' });

    await loginAs(context, seed, user, tenant.id);
  });

  test('日々ノート作成画面でタグ一覧が表示される', async ({ page }) => {
    await page.goto('/dashboard?tab=my-notes');
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
    await page.goto('/dashboard?tab=my-notes');
    const emotionTag = page.locator('button[data-testid^="tag-filter-"]').filter({ hasText: 'うれしい' });
    const taskTag = page.locator('button[data-testid^="tag-filter-"]').filter({ hasText: '授業準備' });
    await expect(emotionTag).toBeVisible();
    await expect(taskTag).toBeVisible();
  });

  test('タグを選択してエントリ投稿し、マイノートに表示される', async ({ page }) => {
    await page.goto('/dashboard?tab=my-notes');
    // ふりかえりカードは折りたたみ既定。CTA で展開してからモード切替 (retro-recommend UI)。
    await page.getByTestId('reflection-open-cta').click();
    await page.getByTestId('diary-mode-free').click();
    await page.getByTestId('diary-content-input').fill('うれしいことがあった');

    // タグを選択
    const emotionTag = page.locator('button[data-testid^="tag-filter-"]').filter({ hasText: 'うれしい' });
    await emotionTag.click();

    // 選択件数カウンターが表示される
    await expect(page.getByTestId('tag-filter-count')).toContainText('1 件選択中');

    await page.getByTestId('diary-submit').click();
    await expect(page.getByTestId('diary-content-input')).toHaveValue('');

    // マイノートタブで自分の投稿を確認
    await expect(
      page.getByTestId('tabpanel-my-notes').getByText('うれしいことがあった'),
    ).toBeVisible();
  });

  test('複数タグを選択できる', async ({ page }) => {
    await page.goto('/dashboard?tab=my-notes');
    // ふりかえりカードは折りたたみ既定。CTA で展開してからモード切替 (retro-recommend UI)。
    await page.getByTestId('reflection-open-cta').click();
    await page.getByTestId('diary-mode-free').click();
    await page.getByTestId('diary-content-input').fill('複数タグ');
    await page.locator('button[data-testid^="tag-filter-"]').filter({ hasText: 'うれしい' }).click();
    await page.locator('button[data-testid^="tag-filter-"]').filter({ hasText: '授業準備' }).click();
    await expect(page.getByTestId('tag-filter-count')).toContainText('2 件選択中');
  });

  test('タグの再クリックで選択解除される', async ({ page }) => {
    await page.goto('/dashboard?tab=my-notes');
    const emotionTag = page.locator('button[data-testid^="tag-filter-"]').filter({ hasText: 'うれしい' });
    await emotionTag.click();
    await expect(page.getByTestId('tag-filter-count')).toContainText('1 件選択中');
    await emotionTag.click();
    // カウンターは selectedTagIds.length > 0 のときのみ表示
    await expect(page.getByTestId('tag-filter-count')).not.toBeVisible();
  });
});
