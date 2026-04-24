import type { AppProps } from 'next/app';
import { SessionProvider } from 'next-auth/react';
import { ToastProvider } from '@/shared/components/Toast';
import '../src/styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SessionProvider session={pageProps.session}>
      <ToastProvider>
        <Component {...pageProps} />
      </ToastProvider>
    </SessionProvider>
  );
}
