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
          // 最終カラールール (2026-05-04 chimo): グレー基調 + 青 1 点。金・紫廃止
          bg: '#fafafa',
          surface: '#ffffff',
          header: '#18181b',
          accent: '#4f46e5', // primary blue (新規タスク等の唯一の色)
          border: '#eaeaea',
          // hover / 補助グレー面 (タグ背景・hover 統一色)
          'muted-bg': '#f5f5f5',
          green: '#52a876',
          'green-bg': '#edf7f2',
          'green-text': '#3a8a5e',
          // gold 系は廃止予定 (現在 dev-login でのみ参照)、当面エイリアスとして
          // 残す: 視覚的にはグレー扱いに置換され、参照が消えたら削除する
          gold: '#999',
          'gold-bg': '#f5f5f5',
          'gold-text': '#666',
          red: '#e05252',
          'red-bg': '#fdecea',
          muted: '#999',
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
      },
    },
  },
  plugins: [],
};

export default config;
