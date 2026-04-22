import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['__tests__/setup.ts'],
    // 統合テスト・E2E テストは別ランナーで実行するため exclude
    exclude: [
      '**/node_modules/**',
      '__tests__/integration/**',
      '__tests__/e2e/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.d.ts',
        'src/db/schema.ts',
        'src/db/rls/**',
        'src/shared/lib/db.ts',
        'src/shared/lib/db-auth.ts',
        'src/shared/lib/secrets.ts',
        'src/features/auth/lib/auth-options.ts',
        'src/features/auth/lib/withAuthSSR.ts',
        'src/features/auth/lib/withAuthApi.ts',
        'src/openapi/**',
        // DB 依存サービス層（統合テストでカバー）
        'src/features/admin-dashboard/lib/adminDashboardService.ts',
        'src/features/admin-dashboard/lib/alertDetectionService.ts',
        'src/features/admin-dashboard/lib/alertService.ts',
        'src/features/teacher-dashboard/lib/emotionTrendService.ts',
        // SWR フック（コンポーネントテストでカバー）
        'src/features/*/hooks/**',
        // Zod スキーマ（型定義のみ）
        'src/features/*/schemas/**',
        // Unit-04 admin-dashboard components: 未カバーの UI 群は MVP 後に test 追加予定
        // (AlertItem / AlertList / SchoolTrendBarChart / Sparkline / TeacherStatus* 計 7 file)
        'src/features/admin-dashboard/components/AlertItem.tsx',
        'src/features/admin-dashboard/components/AlertList.tsx',
        'src/features/admin-dashboard/components/SchoolTrendBarChart.tsx',
        'src/features/admin-dashboard/components/Sparkline.tsx',
        'src/features/admin-dashboard/components/TeacherStatusCard.tsx',
        'src/features/admin-dashboard/components/TeacherStatusGrid.tsx',
        'src/features/admin-dashboard/components/TeacherStatusTable.tsx',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
