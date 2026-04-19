// GoogleCallback: Google 認可後のコールバック (Authorization Code Flow + PKCE)
//
// Google は response_type=code で ?code=xxx&state=yyy を query string で返す。
// (fragment ではないため Next.js の URL 警告を踏まない)
//
// フロー:
// 1. query から code / state を取り出す
// 2. state を sessionStorage と照合 (CSRF 対策)
// 3. sessionStorage から PKCE code_verifier を取り出す
// 4. ブラウザから https://oauth2.googleapis.com/token に POST (code + verifier)
// 5. 受け取った id_token を /api/auth/google-signin に POST
// 6. セッション cookie を受け取ってホームへ遷移
//
// 設計詳細: aidlc-docs/construction/auth-externalization.md
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function GoogleCallbackPage() {
  const router = useRouter();
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    // ─── DEBUG LOG (仮説検証用・後で削除) ───
    // useEffect が 2 回以上発火しているか・各発火時に何が残っているかを確認する
    // 本番の URL と cookie は出さない・booleans と短縮値のみ
    console.log('[callback] useEffect fired', {
      hasSearch: !!window.location.search,
      searchLen: window.location.search.length,
      hasState: !!sessionStorage.getItem('google_oauth_state'),
      hasVerifier: !!sessionStorage.getItem('google_oauth_verifier'),
      timestamp: Date.now(),
    });

    let cancelled = false;

    async function run() {
      // query からパラメータを取り出す (?code=...&state=...)
      const params = new URLSearchParams(window.location.search);

      const googleError = params.get('error');
      if (googleError) {
        setErrorCode(googleError);
        return;
      }

      const code = params.get('code');
      const state = params.get('state');

      const storedState = sessionStorage.getItem('google_oauth_state');
      const verifier = sessionStorage.getItem('google_oauth_verifier');

      // ─── DEBUG LOG (仮説検証用・後で削除) ───
      console.log('[callback] run() entered', {
        hasCode: !!code,
        hasStateInUrl: !!state,
        hasStoredState: !!storedState,
        stateMatches: state === storedState,
        hasVerifier: !!verifier,
      });

      if (!code || !state || state !== storedState || !verifier) {
        console.log('[callback] → INVALID_RESPONSE branch taken', {
          reason: !code ? 'no_code'
               : !state ? 'no_state_in_url'
               : state !== storedState ? 'state_mismatch'
               : 'no_verifier',
        });
        setErrorCode('INVALID_RESPONSE');
        return;
      }

      // sessionStorage からは即座に削除 (再利用防止)
      sessionStorage.removeItem('google_oauth_state');
      sessionStorage.removeItem('google_oauth_verifier');

      // URL からも code を除去 (履歴に残さない)
      window.history.replaceState(null, '', window.location.pathname);

      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (!clientId) {
        if (!cancelled) setErrorCode('SERVER_CONFIG_ERROR');
        return;
      }

      // Google の /token エンドポイントに POST (ブラウザ → Google 直接)
      let idToken: string | undefined;
      try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
            code,
            code_verifier: verifier,
            redirect_uri: `${window.location.origin}/auth/google-callback`,
          }).toString(),
        });

        if (!tokenRes.ok) {
          if (!cancelled) setErrorCode('TOKEN_EXCHANGE_FAILED');
          return;
        }

        const tokenData: { id_token?: string } = await tokenRes.json();
        idToken = tokenData.id_token;
        if (!idToken) {
          if (!cancelled) setErrorCode('TOKEN_EXCHANGE_FAILED');
          return;
        }
      } catch {
        if (!cancelled) setErrorCode('TOKEN_EXCHANGE_FAILED');
        return;
      }

      // バックエンドにセッション発行依頼
      try {
        const res = await fetch('/api/auth/google-signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });

        if (res.ok) {
          if (!cancelled) await router.push('/');
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
