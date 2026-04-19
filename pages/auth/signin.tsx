// LoginPage: Google OAuth ログインのエントリポイント
//
// 認証外部化設計: 自前ボタン + リダイレクト型の Implicit Flow。
// クリック時に Google の認可エンドポイントへ遷移 → Google が
// /auth/google-callback に ID Token を URL fragment で返す → コールバック側で
// /api/auth/google-signin に POST してセッション発行。
//
// GIS (Google Identity Services) ライブラリを使わないため CSP 緩和不要。
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
  error,
  isDev,
  googleClientId,
}: SignInPageProps) {
  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.UNKNOWN)
    : null;

  function handleGoogleLogin() {
    // CSRF 対策: state を生成して sessionStorage に保存
    //   → コールバック側で一致確認（第三者が誘発したコールバックを拒否）
    // リプレイ対策: nonce を生成（Google が ID Token に含める）
    //   → MVP β では nonce のサーバ検証は省略（HTTPS + exp 1h で代替）
    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    sessionStorage.setItem('google_oauth_state', state);
    sessionStorage.setItem('google_oauth_nonce', nonce);

    const params = new URLSearchParams({
      client_id: googleClientId,
      response_type: 'id_token',
      scope: 'openid email profile',
      redirect_uri: `${window.location.origin}/auth/google-callback`,
      state,
      nonce,
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
