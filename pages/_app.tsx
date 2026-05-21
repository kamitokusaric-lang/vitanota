import type { AppProps } from 'next/app';
import { SessionProvider } from 'next-auth/react';
import { Klee_One } from 'next/font/google';
import { ToastProvider } from '@/shared/components/Toast';
import '../src/styles/globals.css';

// 2026-05-21 AI 週次日誌 β カード用フォント。 教科書体ベースで手書き寄りの優しい印象。
// AiPostRailItem の本文だけで使用する。 latin subset 指定だが Google Fonts の
// unicode-range で日本語字形も lazy 読み込みされる。
const aiCardFont = Klee_One({
  weight: ['400', '600'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ai-card',
  preload: false,
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SessionProvider session={pageProps.session}>
      <ToastProvider>
        <div className={aiCardFont.variable}>
          <Component {...pageProps} />
        </div>
      </ToastProvider>
    </SessionProvider>
  );
}
