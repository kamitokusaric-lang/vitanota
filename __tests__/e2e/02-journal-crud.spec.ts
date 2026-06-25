// Step 16b - Spec 02: 日誌エントリ CRUD
// 関連ストーリー: US-T-010 (作成) / US-T-011 (編集) / US-T-012 (削除)
// 2026-06-25 update (UI 刷新): 投稿入口をモーダル(quick-record-*)から常時表示のインラインへ。
//   - 職員室ノート投稿 = 右レーン (xl) の TodayCaptureBox インライン
//     (capture-content-input / capture-submit)。投稿後はフォームが残り内容がクリアされる。
//   - 日々ノート = マイノートタブ (?tab=my-notes) の DiaryNoteBox インライン
//     (diary-content-input / diary-submit)。
//   - 編集 = 職員室ノートレーンのカード kebab (entry-card-menu-*) → 編集 Modal (TodayCaptureBox)。
//     Modal 内の capture-* は modal-content にスコープして rail のインラインと区別する。
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
    // 右レーンのインライン投稿フォーム (xl で常時表示) に直接入力
    await page.getByTestId('capture-content-input').fill('今日の授業の振り返り');
    await page.getByTestId('capture-submit').click();

    // インラインフォームは残り、投稿後は内容がクリアされる
    await expect(page.getByTestId('capture-content-input')).toHaveValue('');

    // マイノートタブで自分の投稿を確認 (公開エントリは右レーンにも出るためタブ内にスコープ)
    await page.goto('/dashboard?tab=my-notes');
    await expect(
      page.getByTestId('tabpanel-my-notes').getByText('今日の授業の振り返り'),
    ).toBeVisible();
  });

  test('US-T-010: 1000文字制限のクライアント側バリデーション', async ({ page }) => {
    await page.goto('/dashboard');
    const textarea = page.getByTestId('capture-content-input');
    // 既定種別 note (つぶやき) のとき maxLength=1000
    expect(await textarea.getAttribute('maxlength')).toBe('1000');
  });

  test('US-T-010: 空文字状態では submit ボタンが disabled', async ({ page }) => {
    await page.goto('/dashboard');
    // content 空のとき「書く」ボタンが disabled
    await expect(page.getByTestId('capture-submit')).toBeDisabled();
  });

  test('US-T-010: 自分用の日々ノート (非公開) を作成できる', async ({ page }) => {
    // 日々ノートはマイノートタブの「今日のふりかえり」インライン入力
    await page.goto('/dashboard?tab=my-notes');
    await page.getByTestId('diary-content-input').fill('非公開の日記');
    await page.getByTestId('diary-submit').click();
    await expect(page.getByTestId('diary-content-input')).toHaveValue('');

    // 日々ノートは自分のマイノートでのみ可視
    await expect(
      page.getByTestId('tabpanel-my-notes').getByText('非公開の日記'),
    ).toBeVisible();
  });

  test('US-T-011: 職員室ノートのカード menu 経由で編集できる', async ({ page }) => {
    // 公開投稿を作成 (右レーンのインラインフォーム)
    await page.goto('/dashboard');
    await page.getByTestId('capture-content-input').fill('編集前の本文');
    await page.getByTestId('capture-submit').click();
    await expect(page.getByTestId('capture-content-input')).toHaveValue('');

    // 職員室ノートレーンの自分の投稿の kebab → 編集
    await page.goto('/dashboard');
    await expect(page.getByText('編集前の本文')).toBeVisible();

    await page.locator('[data-testid^="entry-card-menu-button-"]').first().click();
    await page.locator('[data-testid^="entry-card-menu-edit-"]').first().click();

    // 編集 Modal 内の投稿フォーム (rail のインラインと重複するため modal-content にスコープ)
    const modal = page.getByTestId('modal-content');
    await modal.getByTestId('capture-content-input').fill('編集後の本文');
    await modal.getByTestId('capture-submit').click();

    await expect(page.getByText('編集後の本文')).toBeVisible();
    await expect(page.getByText('編集前の本文')).not.toBeVisible();
  });

  test('US-T-012: 削除メニュー → confirm Modal で削除できる', async ({ page }) => {
    // 公開投稿を作成
    await page.goto('/dashboard');
    await page.getByTestId('capture-content-input').fill('削除予定');
    await page.getByTestId('capture-submit').click();
    await expect(page.getByTestId('capture-content-input')).toHaveValue('');

    // 職員室ノートレーンの自分の投稿の kebab → 削除 → confirm Modal
    await page.goto('/dashboard');
    await expect(page.getByText('削除予定')).toBeVisible();

    await page.locator('[data-testid^="entry-card-menu-button-"]').first().click();
    await page.locator('[data-testid^="entry-card-menu-delete-"]').first().click();
    await page.getByTestId('confirm-delete-confirm-button').click();

    await expect(page.getByText('削除予定')).not.toBeVisible();
  });
});
