// Step 16b - Spec 02: 日誌エントリ CRUD
// 関連ストーリー: US-T-010 (作成) / US-T-011 (編集) / US-T-012 (削除)
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

  test('US-T-010: 新規投稿してマイ記録に表示される', async ({ page }) => {
    await page.goto('/journal/new');
    await page.getByTestId('entry-form-content-input').fill('今日の授業の振り返り');
    await page.getByTestId('entry-form-submit-button').click();

    // 投稿後はマイ記録ページへ遷移
    await expect(page).toHaveURL(/\/journal\/mine/);
    // 投稿が表示される
    await expect(page.getByText('今日の授業の振り返り')).toBeVisible();
  });

  test('US-T-010: 200文字制限のクライアント側バリデーション', async ({ page }) => {
    await page.goto('/journal/new');
    const textarea = page.getByTestId('entry-form-content-input');
    // textarea の maxLength=200 で物理的にも入力が制限される
    expect(await textarea.getAttribute('maxlength')).toBe('200');
  });

  test('US-T-010: 空文字で submit するとバリデーションエラー', async ({ page }) => {
    await page.goto('/journal/new');
    await page.getByTestId('entry-form-submit-button').click();
    await expect(page.getByTestId('entry-form-content-error')).not.toBeEmpty();
  });

  test('US-T-010: 「自分だけに保存」チェックで非公開エントリ作成', async ({ page }) => {
    await page.goto('/journal/new');
    await page.getByTestId('entry-form-content-input').fill('非公開の日記');
    await page.getByTestId('entry-form-private-checkbox').check();
    await page.getByTestId('entry-form-submit-button').click();

    await expect(page).toHaveURL(/\/journal\/mine/);
    // マイ記録には privacy バッジ付きで表示される
    await expect(page.getByText('非公開の日記')).toBeVisible();
  });

  test('US-T-011: マイ記録から編集ページへ遷移して内容を更新', async ({ page, request, context }) => {
    // 既存エントリを 1 件シード
    const seed = new SeedClient(request);
    // beforeEach のユーザーを取得し直す代わりに、新規ユーザーを使う場合は再ログイン必要
    // 本テストは beforeEach の認証コンテキストを使う
    await page.goto('/journal/new');
    await page.getByTestId('entry-form-content-input').fill('編集前の本文');
    await page.getByTestId('entry-form-submit-button').click();
    await expect(page).toHaveURL(/\/journal\/mine/);

    // 編集リンクをクリック
    const editLink = page.locator('[data-testid^="entry-card-edit-link-"]').first();
    await editLink.click();
    await expect(page).toHaveURL(/\/journal\/.*\/edit/);

    // 編集
    const textarea = page.getByTestId('entry-form-content-input');
    await textarea.fill('編集後の本文');
    await page.getByTestId('entry-form-submit-button').click();

    await expect(page).toHaveURL(/\/journal\/mine/);
    await expect(page.getByText('編集後の本文')).toBeVisible();
    await expect(page.getByText('編集前の本文')).not.toBeVisible();
  });

  test('US-T-012: 削除ボタンクリックで confirm 後にエントリが消える', async ({ page }) => {
    // エントリ作成
    await page.goto('/journal/new');
    await page.getByTestId('entry-form-content-input').fill('削除予定');
    await page.getByTestId('entry-form-submit-button').click();
    await expect(page).toHaveURL(/\/journal\/mine/);

    // 編集ページへ
    await page.locator('[data-testid^="entry-card-edit-link-"]').first().click();
    await expect(page).toHaveURL(/\/journal\/.*\/edit/);

    // confirm ダイアログを accept
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByTestId('edit-journal-delete-button').click();

    await expect(page).toHaveURL(/\/journal\/mine/);
    await expect(page.getByText('削除予定')).not.toBeVisible();
  });
});
