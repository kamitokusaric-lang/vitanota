import type { AppProps } from 'next/app';
import { SessionProvider } from 'next-auth/react';
import { Zen_Kaku_Gothic_New } from 'next/font/google';
import { ToastProvider } from '@/shared/components/Toast';
import '../src/styles/globals.css';

// 2026-06-25 chimo 案A: フォントを Zen Kaku Gothic New 1 書体に統一 (見出し〜本文すべて)。
// タイトル 900 / ボタン・ラベル 700 / 本文 400〜500。落ち着いた角ゴシックで教員層に馴染むトーン。
// latin subset 指定だが Google Fonts の unicode-range で日本語字形も lazy 読み込みされる。
const zenKaku = Zen_Kaku_Gothic_New({
  weight: ['400', '500', '700', '900'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-zen-kaku',
  preload: false,
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SessionProvider session={pageProps.session}>
      <ToastProvider>
        {/* portal (Modal 等) も <body> 直下に出るため、:root に変数を注入して
            ページ全体に Zen Kaku を効かせる (chimo 2026-06-25)。 */}
        <style jsx global>{`
          :root {
            --font-zen-kaku: ${zenKaku.style.fontFamily};
          }
        `}</style>
        <div className={`${zenKaku.variable} font-sans`}>
          <Component {...pageProps} />
        </div>
      </ToastProvider>
    </SessionProvider>
  );
}
