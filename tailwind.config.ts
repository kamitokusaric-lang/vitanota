import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        vn: {
          // 2026-05-20 chimo UI 洗練: ページ背景は slate-50 寄り、 ヘッダーはより深い zinc、 ボーダーは slate-200
          bg: '#F8FAFC',
          surface: '#FFFFFF',
          header: '#111318',
          accent: '#4F46E5', // primary blue (新規タスク等の唯一の色)
          border: '#E2E8F0',
          'border-strong': '#CBD5E1',
          // hover / 補助グレー面 (タグ背景・hover 統一色)
          'muted-bg': '#F1F5F9',
          // 朝カード (H3-B): 黄色は淡く、 ivory cream + amber border 系 (chimo 2026-05-20 final-tune)
          'morning-bg': '#FFFDF7',
          'morning-border': '#FDE68A',
          'morning-text': '#92400E',
          // danger / warning / neutral: chimo 設計憲法
          'danger-bg': '#FFF1F2',
          'danger-border': '#FDA4AF',
          'danger-text': '#BE123C',
          'warning-bg': '#FFFBEB',
          'warning-border': '#FBBF24',
          'warning-text': '#B45309',
          green: '#52a876',
          'green-bg': '#edf7f2',
          'green-text': '#3a8a5e',
          // gold 系は廃止予定 (現在 dev-login でのみ参照)、当面エイリアスとして
          // 残す: 視覚的にはグレー扱いに置換され、参照が消えたら削除する
          gold: '#999',
          'gold-bg': '#f5f5f5',
          'gold-text': '#666',
          red: '#DC2626',
          'red-bg': '#FFF1F2',
          muted: '#94A3B8',
        },
      },
      borderRadius: {
        vn: '14px',
      },
      keyframes: {
        bob: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      animation: {
        bob: 'bob 2.4s ease-in-out infinite',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Hiragino Sans',
          'sans-serif',
        ],
        // AI 週次日誌 β カード本文 (Klee One: 教科書体ベース、 手書き寄りの優しい印象)。
        // next/font/google で _app.tsx から読み込み、 CSS variable --font-ai-card に注入。
        'ai-card': [
          'var(--font-ai-card)',
          '"Klee One"',
          '"Hiragino Maru Gothic ProN"',
          '"Hiragino Maru Gothic Pro"',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
