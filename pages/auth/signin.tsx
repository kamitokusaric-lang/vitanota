// LoginPage: Google OAuth ログインのエントリポイント
//
// 認証外部化設計: ブラウザが Google と直接通信して ID Token を取得し、
// /api/auth/google-signin に POST してセッション発行を受ける。
// バックエンドは Google と通信しない。
//
// 設計詳細: aidlc-docs/construction/auth-externalization.md
import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { getSession } from 'next-auth/react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import type { CredentialResponse } from '@react-oauth/google';
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

export default function SignInPage({
  error: initialError,
  isDev,
  googleClientId,
}: SignInPageProps) {
  const router = useRouter();
  const [errorCode, setErrorCode] = useState<string | undefined>(initialError);
  const [loading, setLoading] = useState(false);

  const errorMessage = errorCode
    ? (ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.UNKNOWN)
    : null;

  async function handleGoogleSuccess(response: CredentialResponse) {
    if (!response.credential) {
      setErrorCode('INVALID_TOKEN');
      return;
    }
    setLoading(true);
    setErrorCode(undefined);
    try {
      const res = await fetch('/api/auth/google-signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: response.credential }),
      });

      if (res.ok) {
        // セッション cookie がサーバから発行済み。ホームへ遷移
        await router.push('/');
        return;
      }

      const data: { error?: string } = await res.json().catch(() => ({}));
      setErrorCode(data.error ?? 'UNKNOWN');
    } catch (err) {
      setErrorCode('UNKNOWN');
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleError() {
    setErrorCode('INVALID_TOKEN');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-vn-bg px-4">
      <div className="w-full max-w-sm rounded-vn border border-vn-border bg-white p-8">
        {/* ロゴ */}
        <h1 className="mb-2 text-center text-2xl font-bold" data-testid="signin-logo">
          vita<span className="text-vn-accent">nota</span>
          <span className="text-vn-accent">.</span>
        </h1>
        <p className="mb-8 text-center text-sm text-vn-muted">
          教員のウェルネスをサポートするツール
        </p>

        {/* エラー表示 */}
        {errorMessage && (
          <div className="mb-6">
            <ErrorMessage message={errorMessage} />
          </div>
        )}

        {/* Google ログインボタン */}
        <div
          className="flex justify-center"
          data-testid="signin-google-button"
          aria-busy={loading}
        >
          <GoogleOAuthProvider clientId={googleClientId}>
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
              useOneTap={false}
              text="signin_with"
              shape="rectangular"
            />
          </GoogleOAuthProvider>
        </div>

        {loading && (
          <p className="mt-4 text-center text-sm text-vn-muted">
            ログイン処理中…
          </p>
        )}

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
