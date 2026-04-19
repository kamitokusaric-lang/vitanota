// LoginPage: Google OAuth ログインのエントリポイント
//
// 認証外部化設計 (Authorization Code Flow + PKCE):
// 1. ブラウザで code_verifier / code_challenge を生成
// 2. Google 認可エンドポイントへリダイレクト (response_type=code)
// 3. Google が /auth/google-callback?code=... に戻す (query string)
// 4. callback ページがブラウザから Google /token に直接 POST (PKCE verifier 送付)
// 5. 受け取った ID Token を /api/auth/google-signin に POST してセッション発行
//
// バックエンドは Google とは通信しない。
// 設計詳細: aidlc-docs/construction/auth-externalization.md
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { getSession } from 'next-auth/react';
import { ErrorMessage } from '@/shared/components/ErrorMessage';

const ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked:
    'このメールアドレスは別のログイン方式で登録されています',
  AccessDenied:
    'アカウントが見つかりません。招待リンクからサインアップしてください',
  NOT_INVITED:
    'アカウントが見つかりません。招待リンクからサインアップしてください',
  INVALID_TOKEN:
    'Google からのトークンが無効です。時計のずれやブラウザ拡張機能が原因の可能性があります。',
  INVALID_RESPONSE:
    'Google からの応答が不正です。再度お試しください。',
  TOKEN_EXCHANGE_FAILED:
    'Google とのトークン交換に失敗しました。再度お試しください。',
  SERVER_CONFIG_ERROR:
    'サーバ設定エラーです。管理者にお問い合わせください。',
  VALIDATION_ERROR: 'リクエストが不正です。もう一度お試しください。',
  UNKNOWN: 'ログインに失敗しました。再度お試しください。',
};

interface SignInPageProps {
  error?: string;
  isDev?: boolean;
  googleClientId: string;
}

// PKCE: code_verifier (RFC 7636 で 43-128 文字の [A-Za-z0-9-._~] 推奨)
function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const bytes = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return base64urlEncode(new Uint8Array(hash));
}

function base64urlEncode(bytes: Uint8Array): string {
  // btoa 用に String.fromCharCode でバイト列を文字列化
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default function SignInPage({
  error,
  isDev,
  googleClientId,
}: SignInPageProps) {
  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.UNKNOWN)
    : null;

  async function handleGoogleLogin() {
    // PKCE: verifier 生成 → challenge = base64url(SHA256(verifier))
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = crypto.randomUUID();

    sessionStorage.setItem('google_oauth_verifier', verifier);
    sessionStorage.setItem('google_oauth_state', state);

    // ─── DEBUG LOG (仮説検証用・後で削除) ───
    console.log('[signin] sessionStorage set', {
      verifierLen: verifier.length,
      stateLen: state.length,
      checkVerifier: !!sessionStorage.getItem('google_oauth_verifier'),
      checkState: !!sessionStorage.getItem('google_oauth_state'),
    });

    const params = new URLSearchParams({
      client_id: googleClientId,
      response_type: 'code',  // ★ Authorization Code Flow
      scope: 'openid email profile',
      redirect_uri: `${window.location.origin}/auth/google-callback`,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-vn-bg px-4">
      <div className="w-full max-w-sm rounded-vn border border-vn-border bg-white p-8">
        <h1 className="mb-2 text-center text-2xl font-bold" data-testid="signin-logo">
          vita<span className="text-vn-accent">nota</span>
          <span className="text-vn-accent">.</span>
        </h1>
        <p className="mb-8 text-center text-sm text-vn-muted">
          先生ノート。日々を残し、明日につなげる場所
        </p>

        {errorMessage && (
          <div className="mb-6">
            <ErrorMessage message={errorMessage} />
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          data-testid="signin-google-button"
          className="w-full rounded-[10px] bg-vn-header py-[15px] text-[15px] font-semibold text-white transition-opacity hover:opacity-85"
        >
          Google でログイン
        </button>

        {isDev && (
          <Link
            href="/auth/dev-login"
            className="mt-4 block text-center text-sm text-vn-muted hover:text-vn-accent"
          >
            Dev Login (開発環境専用)
          </Link>
        )}
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context);
  if (session) {
    return { redirect: { destination: '/', permanent: false } };
  }

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    throw new Error('NEXT_PUBLIC_GOOGLE_CLIENT_ID env var is not set');
  }

  const error = (context.query.error as string | undefined) ?? null;
  const isDev = process.env.NODE_ENV === 'development';

  return {
    props: {
      ...(error ? { error } : {}),
      ...(isDev ? { isDev } : {}),
      googleClientId,
    },
  };
};
