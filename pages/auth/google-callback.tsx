// GoogleCallback: Google 認可後のコールバック
//
// Google は response_type=id_token で URL fragment (#id_token=...) に
// ID Token を付けて遷移してくる。fragment はサーバに送信されないため、
// クライアントサイド JS で取り出して /api/auth/google-signin に POST する。
//
// 設計詳細: aidlc-docs/construction/auth-externalization.md
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function GoogleCallbackPage() {
  const router = useRouter();
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // fragment からパラメータを取り出す (#id_token=...&state=...)
      const hash = window.location.hash.startsWith('#')
        ? window.location.hash.substring(1)
        : '';
      const params = new URLSearchParams(hash);

      // Google からのエラー応答
      const googleError = params.get('error');
      if (googleError) {
        setErrorCode(googleError);
        return;
      }

      const idToken = params.get('id_token');
      const state = params.get('state');

      // state 検証 (CSRF 対策)
      const storedState = sessionStorage.getItem('google_oauth_state');
      if (!idToken || !state || state !== storedState) {
        setErrorCode('INVALID_RESPONSE');
        return;
      }

      sessionStorage.removeItem('google_oauth_state');
      sessionStorage.removeItem('google_oauth_nonce');

      // fragment は履歴に残さないよう即座にクリア
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search,
      );

      // バックエンドにセッション発行依頼
      try {
        const res = await fetch('/api/auth/google-signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });

        if (res.ok) {
          if (!cancelled) {
            await router.push('/');
          }
          return;
        }

        const data: { error?: string } = await res.json().catch(() => ({}));
        if (!cancelled) setErrorCode(data.error ?? 'UNKNOWN');
      } catch {
        if (!cancelled) setErrorCode('UNKNOWN');
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (errorCode) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-vn-bg px-4">
        <div className="w-full max-w-sm rounded-vn border border-vn-border bg-white p-8 text-center">
          <p className="mb-4 text-sm text-vn-muted">
            ログインに失敗しました（{errorCode}）。
          </p>
          <Link
            href="/auth/signin"
            className="text-sm text-vn-accent hover:underline"
          >
            サインインページへ戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-vn-bg px-4">
      <p className="text-sm text-vn-muted">ログイン処理中…</p>
    </div>
  );
}
