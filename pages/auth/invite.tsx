// BP-02 Step 4〜5: 招待トークン処理ページ
// トークンを検証して Google OAuth へ誘導する
import type { GetServerSideProps } from 'next';
import { signIn } from 'next-auth/react';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';

interface InvitePageProps {
  valid: boolean;
  email?: string;
  role?: string;
  token: string;
  errorCode?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  INVITE_USED: 'この招待リンクは既に使用されています',
  INVITE_EXPIRED: '招待リンクの有効期限が切れています。再度招待を依頼してください。',
  NOT_FOUND: '招待リンクが見つかりません',
};

const ROLE_LABELS: Record<string, string> = {
  teacher: '教員',
  school_admin: '学校管理者',
};

export default function InvitePage({ valid, email, role, token, errorCode }: InvitePageProps) {
  if (!valid || errorCode) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="mb-6 text-center text-xl font-bold text-gray-800">招待リンクエラー</h1>
          <ErrorMessage message={errorCode ? (ERROR_MESSAGES[errorCode] ?? '無効な招待リンクです') : '無効な招待リンクです'} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-center text-2xl font-bold text-blue-600">vitanota</h1>
        <p className="mb-6 text-center text-sm text-gray-500">招待を受け付けました</p>

        <div className="mb-6 rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
          <p>
            <strong>{email}</strong> 宛の招待です。
          </p>
          <p className="mt-1">
            ロール: <strong>{role ? (ROLE_LABELS[role] ?? role) : '—'}</strong>
          </p>
        </div>

        <p className="mb-4 text-sm text-gray-600">
          以下のアカウントでログインして招待を承諾してください。
        </p>

        <Button
          variant="primary"
          className="w-full"
          onClick={() =>
            signIn('google', {
              callbackUrl: `/api/invitations/${token}`,
            })
          }
          data-testid="invite-signin-button"
        >
          Google でログインして参加
        </Button>
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { token } = context.query;

  if (typeof token !== 'string') {
    return { props: { valid: false, token: '', errorCode: 'NOT_FOUND' } };
  }

  try {
    const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/invitations/${token}`);
    const data = await response.json();

    if (!response.ok) {
      return {
        props: { valid: false, token, errorCode: data.error ?? 'NOT_FOUND' },
      };
    }

    return {
      props: {
        valid: true,
        token,
        email: data.invitation.email,
        role: data.invitation.role,
      },
    };
  } catch {
    return { props: { valid: false, token, errorCode: 'NOT_FOUND' } };
  }
};
