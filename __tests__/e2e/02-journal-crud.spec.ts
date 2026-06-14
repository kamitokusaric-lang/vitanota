// Step 16b - Spec 02: 日誌エントリ CRUD
// 関連ストーリー: US-T-010 (作成) / US-T-011 (編集) / US-T-012 (削除)
// 2026-06-14 update (記録入力一本化): 投稿入口を右レーンの 2 箱に再編。
//   - quick-record-tweet → 「職員室ノートに投稿する」Modal = TodayCaptureBox
//     (capture-content-input / capture-submit・常に公開・種別チップ)。
//   - quick-record-diary → 「自分用の日々ノート」Modal = DiaryNoteBox
//     (diary-content-input / diary-submit・常に非公開)。
//   作成・編集とも投稿フォーム (TodayCaptureBox / DiaryNoteBox) に統一 (EntryForm は廃止)。
// 表示: マイノートはトップタブ (?tab=my-notes) の MyNotesByKind に集約。
// 編集/削除: 職員室ノートレーン (PublicTimelineRail) の自分の投稿カード右上 kebab
//   (entry-card-menu-*) → 編集は投稿フォーム TodayCaptureBox と統一 (capture-*)、削除は confirm Modal。
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
    await page.getByTestId('capture-content-input').fill('今日の授業の振り返り');
    await page.getByTestId('capture-submit').click();

    // Modal が閉じる (capture box が消える)
    await expect(page.getByTestId('capture-content-input')).not.toBeVisible();

    // マイノートタブで自分の投稿を確認
    await page.goto('/dashboard?tab=my-notes');
    await expect(page.getByText('今日の授業の振り返り')).toBeVisible();
  });

  test('US-T-010: 1000文字制限のクライアント側バリデーション', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('quick-record-tweet').click();
    const textarea = page.getByTestId('capture-content-input');
    // 種別未選択 (tweet 相当) のとき maxLength=1000
    expect(await textarea.getAttribute('maxlength')).toBe('1000');
  });

  test('US-T-010: 空文字状態では submit ボタンが disabled', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('quick-record-tweet').click();
    // content 空のとき「書く」ボタンが disabled
    await expect(page.getByTestId('capture-submit')).toBeDisabled();
  });

  test('US-T-010: 自分用の日々ノート (非公開) を作成できる', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByTestId('quick-record-diary').click();
    await page.getByTestId('diary-content-input').fill('非公開の日記');
    await page.getByTestId('diary-submit').click();

    await expect(page.getByTestId('diary-content-input')).not.toBeVisible();

    // 日々ノートは自分のマイノートでのみ可視
    await page.goto('/dashboard?tab=my-notes');
    await expect(page.getByText('非公開の日記')).toBeVisible();
  });

  test('US-T-011: 職員室ノートのカード menu 経由で編集できる', async ({ page }) => {
    // 公開投稿を作成
    await page.goto('/dashboard');
    await page.getByTestId('quick-record-tweet').click();
    await page.getByTestId('capture-content-input').fill('編集前の本文');
    await page.getByTestId('capture-submit').click();
    await expect(page.getByTestId('capture-content-input')).not.toBeVisible();

    // 職員室ノートレーンの自分の投稿の kebab → 編集
    await page.goto('/dashboard');
    await expect(page.getByText('編集前の本文')).toBeVisible();

    await page.locator('[data-testid^="entry-card-menu-button-"]').first().click();
    await page.locator('[data-testid^="entry-card-menu-edit-"]').first().click();

    // 編集 Modal は投稿フォーム (TodayCaptureBox) と統一
    const textarea = page.getByTestId('capture-content-input');
    await textarea.fill('編集後の本文');
    await page.getByTestId('capture-submit').click();
    await expect(page.getByTestId('capture-content-input')).not.toBeVisible();

    await expect(page.getByText('編集後の本文')).toBeVisible();
    await expect(page.getByText('編集前の本文')).not.toBeVisible();
  });

  test('US-T-012: 削除メニュー → confirm Modal で削除できる', async ({ page }) => {
    // 公開投稿を作成
    await page.goto('/dashboard');
    await page.getByTestId('quick-record-tweet').click();
    await page.getByTestId('capture-content-input').fill('削除予定');
    await page.getByTestId('capture-submit').click();
    await expect(page.getByTestId('capture-content-input')).not.toBeVisible();

    // 職員室ノートレーンの自分の投稿の kebab → 削除 → confirm Modal
    await page.goto('/dashboard');
    await expect(page.getByText('削除予定')).toBeVisible();

    await page.locator('[data-testid^="entry-card-menu-button-"]').first().click();
    await page.locator('[data-testid^="entry-card-menu-delete-"]').first().click();
    await page.getByTestId('confirm-delete-confirm-button').click();

    await expect(page.getByText('削除予定')).not.toBeVisible();
  });
});
