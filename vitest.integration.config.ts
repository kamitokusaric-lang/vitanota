// 統合テスト用設定 (Step 16a)
// testcontainers で PostgreSQL を起動するため、unit テストとは別実行
// 実行コマンド: pnpm test:integration
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // testcontainers の Docker 起動・migration 実行に時間がかかるため
    environment: 'node',
    globals: true,
    include: ['__tests__/integration/**/*.test.ts'],
    // テナント変数の漏えいを防ぐため直列実行 (CI でも同様)
    // vitest 4: poolOptions.threads.singleThread は廃止。単一ワーカー直列は
    // maxWorkers: 1 で担保 (isolate は default true のままでテスト間の漏えい防止)。
    pool: 'threads',
    maxWorkers: 1,
    // testcontainers の起動には時間がかかる (15-30 秒)
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // setup ファイルなし (テスト内で beforeAll / afterAll で起動)
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
