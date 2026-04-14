// LoginPage: Google OAuth ログインのエントリポイント
import type { GetServerSideProps } from 'next';
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
}

export default function SignInPage({ error }: SignInPageProps) {
  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? 'ログインに失敗しました。再度お試しください')
    : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        {/* ロゴ */}
        <h1 className="mb-2 text-center text-2xl font-bold text-blue-600" data-testid="signin-logo">
          vitanota
        </h1>
        <p className="mb-8 text-center text-sm text-gray-500">
          教員のウェルネスをサポートするツール
        </p>

        {/* エラー表示 */}
        {errorMessage && (
          <div className="mb-6">
            <ErrorMessage message={errorMessage} />
          </div>
        )}

        {/* Google ログインボタン */}
        <Button
          variant="primary"
          className="w-full"
          onClick={() => signIn('google', { callbackUrl: '/' })}
          data-testid="signin-google-button"
        >
          Google でログイン
        </Button>
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
  return { props: { ...(error ? { error } : {}) } };
};
