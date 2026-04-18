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
          bg: '#f5f3ee',
          header: '#1a1a1a',
          accent: '#d4a853',
          border: '#e8e8e4',
          green: '#52a876',
          'green-bg': '#edf7f2',
          'green-text': '#3a8a5e',
          gold: '#d4a853',
          'gold-bg': '#fdf6e3',
          'gold-text': '#c8920a',
          red: '#e05252',
          'red-bg': '#fdecea',
          muted: '#aaa',
        },
      },
      borderRadius: {
        vn: '14px',
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
