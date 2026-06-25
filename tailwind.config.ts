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
          // 2026-06-25 chimo 案A パレット: 青灰→暖クリーム/コーラルへ全面転換。
          bg: '#FAF4EA', // クリーム背景
          surface: '#FFFCF6', // カード白
          header: '#36302A', // ダークトップバー
          // 主役コーラル (投稿・CTA・タブ active・選択・フォーカス: 唯一のアクセント)
          accent: '#E8694A',
          'accent-hover': '#D4512F', // primary ボタン hover / 旧 indigo-700 の置換先
          'accent-bg': '#FBE7DC', // active チップ淡面 (相談オレンジ淡) / 旧 indigo-50・100 の置換先
          // 文字 (案A)
          ink: '#3F3528', // 本文インク
          'ink-sub': '#9A8C76', // サブ文字
          'ink-sub2': '#A99A84', // サブ文字 (淡)
          // 枠線 (案A)
          border: '#F0E7D6',
          'border-strong': '#EAE0CE',
          'cell-border': '#E3D7C0', // 点線・カンバン空セル枠
          // hover / 補助面 (タグ背景・hover 統一色)
          'muted-bg': '#F3EBDC',
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
          // 生徒の緑 (案A)
          green: '#7FB283',
          'green-bg': '#E3EFE2',
          'green-text': '#5C8A60',
          // リアクション ☕ お疲れ様の茶 (design 2026-06-25。案A に無いため追加)
          'coffee-bg': '#E8DCC4',
          'coffee-border': '#CDB98F',
          'coffee-text': '#7A5C36',
          // gold 系は廃止予定 (現在 dev-login でのみ参照)、当面エイリアスとして
          // 残す: 視覚的にはグレー扱いに置換され、参照が消えたら削除する
          gold: '#999',
          'gold-bg': '#f5f5f5',
          'gold-text': '#666',
          // 案A カテゴリ色 (感謝ピンク / ナレッジ黄 / ひとりごと青)。相談=accent 系・生徒=green。
          pink: '#E26D8A',
          'pink-bg': '#FBE3E8',
          'pink-text': '#C2557A',
          yellow: '#E8B23C',
          'yellow-bg': '#FBEFD0',
          'yellow-text': '#B5832A',
          blue: '#6FA8C7',
          'blue-bg': '#E4EEF4',
          'blue-text': '#4E84A6',
          'accent-text': '#C2632F', // 相談オレンジの文字
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
        // リアクション押下時のワンショット: ポンと跳ねて戻る (chimo 2026-06-25 design)。
        'reaction-pop': {
          '0%': { transform: 'translateY(0) scale(1)' },
          '35%': { transform: 'translateY(-10px) scale(1.4)' },
          '70%': { transform: 'translateY(0) scale(0.94)' },
          '100%': { transform: 'translateY(0) scale(1)' },
        },
        // 押下時に周囲へ飛び散るキラキラ。飛ぶ方向は --sx / --sy で個別指定・回転も加えて派手に。
        'reaction-sparkle': {
          '0%': { opacity: '0', transform: 'translate(0, 0) scale(0.2) rotate(0deg)' },
          '25%': { opacity: '1', transform: 'translate(calc(var(--sx) * 0.5), calc(var(--sy) * 0.5)) scale(1.3) rotate(60deg)' },
          '100%': { opacity: '0', transform: 'translate(var(--sx), var(--sy)) scale(0.4) rotate(150deg)' },
        },
      },
      animation: {
        bob: 'bob 2.4s ease-in-out infinite',
        'reaction-pop': 'reaction-pop 1s ease-out',
        'reaction-sparkle': 'reaction-sparkle 1.1s ease-out forwards',
      },
      fontFamily: {
        // 2026-06-25 chimo 案A: Zen Kaku Gothic New 1 書体に統一 (_app.tsx で注入)。
        sans: [
          'var(--font-zen-kaku)',
          '-apple-system',
          'BlinkMacSystemFont',
          'Hiragino Sans',
          'sans-serif',
        ],
        // ai-card も 1 書体統一に合わせ Zen Kaku へ寄せる (旧 Klee One 手書き演出は廃止)。
        // クラス参照 (font-ai-card) は据え置きで中身だけ差し替え。
        'ai-card': [
          'var(--font-zen-kaku)',
          '-apple-system',
          'Hiragino Sans',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
