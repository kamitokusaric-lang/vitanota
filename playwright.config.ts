// Step 16b: Playwright E2E テスト設定
// stories.md US-T-010〜014 / US-T-098〜100 / US-S-003 をテストする
import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PORT ?? '3000';
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './__tests__/e2e',
  // CI と並列実行の整合性を取る (テナント変数の漏えい防止)
  fullyParallel: false,
  workers: 1,

  // CI で失敗時のリトライ
  retries: process.env.CI ? 2 : 0,

  // Reporter
  reporter: process.env.CI ? [['github'], ['html']] : 'html',

  // Test timeout
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // ローカル実行時は dev サーバーを自動起動 (CI ではビルド済みを起動)
  webServer: {
    command: process.env.CI
      ? 'pnpm start'
      : 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NODE_ENV: 'test',
      // E2E 用 DB (CI では service container、ローカルでは別途)
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/vitanota_test',
      NEXTAUTH_SECRET: 'e2e-test-secret-32-bytes-minimum-length',
      NEXTAUTH_URL: BASE_URL,
      E2E_TEST_MODE: 'true',
    },
  },
});
