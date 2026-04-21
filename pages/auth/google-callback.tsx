// GoogleCallback: Google 認可後のコールバック (Authorization Code Flow + PKCE)
//
// Google は response_type=code で ?code=xxx&state=yyy を query string で返す。
// (fragment ではないため Next.js の URL 警告を踏まない)
//
// フロー:
// 1. query から code / state を取り出す
// 2. state を sessionStorage と照合 (CSRF 対策)
// 3. sessionStorage から PKCE code_verifier を取り出す
// 4. Google Token Proxy Lambda (VPC 外) に {code, codeVerifier} を JSON POST
//    - Proxy が Secrets Manager から client_secret を取得し Google /token を中継
//    - Google の Web application クライアントが PKCE でも client_secret 必須なため
// 5. 受け取った id_token を /api/auth/google-signin に POST
// 6. セッション cookie を受け取ってホームへ遷移
//
// 設計詳細: aidlc-docs/construction/auth-externalization.md
// Lambda 実装: infra/lib/data-shared-stack.ts GoogleTokenProxy
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function GoogleCallbackPage() {
  const router = useRouter();
  const [errorCode, setErrorCode] = useState<string | null>(null);
  // React StrictMode や Next.js router の再生成で useEffect が複数回発火しても
  // OAuth 処理は一度だけ実行する (2 回目で sessionStorage 空 → INVALID_RESPONSE 回避)
  const executedRef = useRef(false);

  useEffect(() => {
    // StrictMode では effect が mount→cleanup→mount と 2 回呼ばれるため、
    // `let cancelled` + cleanup で cancelled=true にすると、
    // 1 回目の in-flight な非同期処理（executedRef によりそのまま完走する）が
    // すべてガードで握り潰されて無限ローディングになる。
    // React 18 では unmount 後 setState は黙って無視される & router.push も安全に呼べるため、
    // cancel フラグを持たず executedRef 一本で「1 度だけ実行」を担保する。
    if (executedRef.current) return;
    executedRef.current = true;

    async function run() {
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

      if (!code || !state || state !== storedState || !verifier) {
        setErrorCode('INVALID_RESPONSE');
        return;
      }

      // sessionStorage からは即座に削除 (再利用防止)
      sessionStorage.removeItem('google_oauth_state');
      sessionStorage.removeItem('google_oauth_verifier');

      const proxyUrl = process.env.NEXT_PUBLIC_GOOGLE_TOKEN_PROXY_URL;
      if (!proxyUrl) {
        setErrorCode('SERVER_CONFIG_ERROR');
        return;
      }

      // Lambda Proxy 経由でトークン交換 (client_secret は Proxy 側 Secrets Manager に格納)
      let idToken: string | undefined;
      try {
        const tokenRes = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, codeVerifier: verifier }),
        });

        const tokenData: {
          id_token?: string;
          error?: string;
          error_description?: string;
        } = await tokenRes.json().catch(() => ({}));

        if (!tokenRes.ok) {
          const detail = tokenData.error ?? `HTTP_${tokenRes.status}`;
          setErrorCode(`TOKEN_EXCHANGE_FAILED:${detail}`);
          return;
        }

        idToken = tokenData.id_token;
        if (!idToken) {
          setErrorCode('TOKEN_EXCHANGE_FAILED:no_id_token');
          return;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'fetch_error';
        setErrorCode(`TOKEN_EXCHANGE_FAILED:${msg}`);
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
          // URL から code を除去 (履歴に残さない)・成功時のみ実施
          window.history.replaceState(null, '', window.location.pathname);
          await router.push('/');
          return;
        }

        const data: { error?: string } = await res.json().catch(() => ({}));
        setErrorCode(data.error ?? 'UNKNOWN');
      } catch {
        setErrorCode('UNKNOWN');
      }
    }

    run();
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
