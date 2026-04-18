// LoginPage: Google OAuth ログインのエントリポイント
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { signIn, getSession } from 'next-auth/react';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';

const ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked:
    'このメールアドレスは別のログイン方式で登録されています',
  AccessDenied:
    'アカウントが見つかりません。招待リンクからサインアップしてください',
};

interface SignInPageProps {
  error?: string;
  isDev?: boolean;
}

export default function SignInPage({ error, isDev }: SignInPageProps) {
  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? 'ログインに失敗しました。再度お試しください')
    : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-vn-bg px-4">
      <div className="w-full max-w-sm rounded-vn border border-vn-border bg-white p-8">
        {/* ロゴ */}
        <h1 className="mb-2 text-center text-2xl font-bold" data-testid="signin-logo">
          vita<span className="text-vn-accent">nota</span><span className="text-vn-accent">.</span>
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
        <button
          onClick={() => signIn('google', { callbackUrl: '/' })}
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

  const error = (context.query.error as string | undefined) ?? null;
  const isDev = process.env.NODE_ENV === 'development';
  return { props: { ...(error ? { error } : {}), ...(isDev ? { isDev } : {}) } };
};
