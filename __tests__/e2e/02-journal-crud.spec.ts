// Step 16b - Spec 02: 日誌エントリ CRUD
// 関連ストーリー: US-T-010 (作成) / US-T-011 (編集) / US-T-012 (削除)
// 2026-05-18 update: /journal/* page 廃止 → /dashboard 統合に追従。
// 2026-05-21 update: notes タブ配下の subtab 構造が廃止 (TimelineTab が
//   「マイノート」単独画面化、 chimo dashboard リファクタ fe61ac5)。
//   timeline-subtab-personal の click は不要に。
// 投稿: QuickRecordActions の pill (quick-record-<kind>) → Modal → EntryForm
// 表示: /dashboard?tab=notes (= TimelineTab 単独画面、 自分の投稿のみ)
// 編集/削除: entry-card-menu-button → menu-edit / menu-delete → Modal
// kind は 'tweet' を使う (mood 不要 / maxLength=200 — 旧 spec の `200文字制限` assertion と整合)
import { test, expect } from '@playwright/test';
import { SeedClient } from './helpers/seed';
import { loginAs } from './helpers/auth';

test.describe('日誌エントリ CRUD', () => {
  test.beforeEach(async ({ request, context }) => {
    const seed = new SeedClient(request);
    await seed.reset();
    const tenant = await seed.createTenant('学校 A');
    const user = await seed.createUser(tenant.id, 'teacher');
    await loginAs(context, seed, user, tenant.id);
  });

  test('US-T-010: 新規投稿してマイノートに表示される', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('quick-record-tweet').click();
    await page.getByTestId('entry-form-content-input').fill('今日の授業の振り返り');
    await page.getByTestId('entry-form-submit-button').click();

    // Modal が閉じる
    await expect(page.getByTestId('entry-form')).not.toBeVisible();

    // 日々ノートタブ + マイノート子タブ で自分の投稿を確認
    await page.goto('/dashboard?tab=notes');
    await expect(page.getByText('今日の授業の振り返り')).toBeVisible();
  });

  test('US-T-010: 200文字制限のクライアント側バリデーション', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('quick-record-tweet').click();
    const textarea = page.getByTestId('entry-form-content-input');
    // tweet は maxLength=200 (kind 別ロジックは EntryForm.tsx 参照)
    expect(await textarea.getAttribute('maxlength')).toBe('200');
  });

  test('US-T-010: 空文字状態では submit ボタンが disabled', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('quick-record-tweet').click();
    // 新 UI: content 空のとき submit ボタンが disabled (EntryForm.tsx 617-620)
    await expect(page.getByTestId('entry-form-submit-button')).toBeDisabled();
  });

  test('US-T-010: 非公開トグルを ON にして非公開エントリ作成', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('quick-record-tweet').click();
    await page.getByTestId('entry-form-content-input').fill('非公開の日記');
    // 非公開トグル: sr-only checkbox + span overlay が pointer events を intercept するため
    // force オプションで checkable element 自体に直接 click (onChange は発火する)
    await page.getByTestId('entry-form-is-public-toggle').check({ force: true });
    await page.getByTestId('entry-form-submit-button').click();

    await expect(page.getByTestId('entry-form')).not.toBeVisible();

    await page.goto('/dashboard?tab=notes');
    await expect(page.getByText('非公開の日記')).toBeVisible();
  });

  test('US-T-011: マイノートから entry-card menu 経由で編集できる', async ({ page }) => {
    // エントリ作成
    await page.goto('/dashboard');
    await page.getByTestId('quick-record-tweet').click();
    await page.getByTestId('entry-form-content-input').fill('編集前の本文');
    await page.getByTestId('entry-form-submit-button').click();
    await expect(page.getByTestId('entry-form')).not.toBeVisible();

    // マイノート子タブ → entry-card menu → menu-edit → 編集 Modal
    await page.goto('/dashboard?tab=notes');
    await expect(page.getByText('編集前の本文')).toBeVisible();

    await page.locator('[data-testid^="entry-card-menu-button-"]').first().click();
    await page.locator('[data-testid^="entry-card-menu-edit-"]').first().click();

    // 編集 Modal (mode='edit') の EntryForm
    const textarea = page.getByTestId('entry-form-content-input');
    await textarea.fill('編集後の本文');
    await page.getByTestId('entry-form-submit-button').click();
    await expect(page.getByTestId('entry-form')).not.toBeVisible();

    await expect(page.getByText('編集後の本文')).toBeVisible();
    await expect(page.getByText('編集前の本文')).not.toBeVisible();
  });

  test('US-T-012: 削除メニュー → confirm Modal で削除できる', async ({ page }) => {
    // エントリ作成
    await page.goto('/dashboard');
    await page.getByTestId('quick-record-tweet').click();
    await page.getByTestId('entry-form-content-input').fill('削除予定');
    await page.getByTestId('entry-form-submit-button').click();
    await expect(page.getByTestId('entry-form')).not.toBeVisible();

    // マイノート子タブ → entry-card menu → menu-delete → confirm-delete Modal
    await page.goto('/dashboard?tab=notes');
    await expect(page.getByText('削除予定')).toBeVisible();

    await page.locator('[data-testid^="entry-card-menu-button-"]').first().click();
    await page.locator('[data-testid^="entry-card-menu-delete-"]').first().click();
    await page.getByTestId('confirm-delete-confirm-button').click();

    await expect(page.getByText('削除予定')).not.toBeVisible();
  });
});
