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
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/vitanota_test',
      RDS_PROXY_ENDPOINT: process.env.RDS_PROXY_ENDPOINT ?? 'localhost',
      DB_USER: process.env.DB_USER ?? 'vitanota_app',
      DB_NAME: process.env.DB_NAME ?? 'vitanota_test',
      DB_PASSWORD: process.env.DB_PASSWORD ?? 'vitanota_app_local',
      NEXTAUTH_SECRET: 'e2e-test-secret-32-bytes-minimum-length',
      NEXTAUTH_URL: BASE_URL,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? 'e2e-dummy',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? 'e2e-dummy',
      E2E_TEST_MODE: 'true',
      SKIP_SECRETS_MANAGER: 'true',
    },
  },
});
