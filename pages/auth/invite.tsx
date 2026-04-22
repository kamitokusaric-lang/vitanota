// BP-02 Step 4〜5: 招待トークン処理ページ
// トークンを検証し、Google OAuth (PKCE + Authorization Code Flow) を開始する。
// 招待 token を sessionStorage に預け、callback で /api/auth/accept-invite へ誘導する。
import type { GetServerSideProps } from 'next';
import { eq } from 'drizzle-orm';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { logger } from '@/shared/lib/logger';
import { getDb } from '@/shared/lib/db';
import { invitationTokens } from '@/db/schema';

interface InvitePageProps {
  valid: boolean;
  email?: string;
  role?: string;
  token: string;
  errorCode?: string;
  googleClientId?: string;
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
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default function InvitePage({
  valid,
  email,
  role,
  token,
  errorCode,
  googleClientId,
}: InvitePageProps) {
  async function handleAcceptInvite() {
    if (!googleClientId) return;
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = crypto.randomUUID();

    sessionStorage.setItem('google_oauth_verifier', verifier);
    sessionStorage.setItem('google_oauth_state', state);
    sessionStorage.setItem('google_oauth_invite_token', token);

    const params = new URLSearchParams({
      client_id: googleClientId,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: `${window.location.origin}/auth/google-callback`,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

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

        <button
          onClick={handleAcceptInvite}
          data-testid="invite-signin-button"
          className="w-full rounded-[10px] bg-vn-header py-[15px] text-[15px] font-semibold text-white transition-opacity hover:opacity-85"
        >
          Google でログインして参加
        </button>
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { token } = context.query;

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    throw new Error('NEXT_PUBLIC_GOOGLE_CLIENT_ID env var is not set');
  }

  if (typeof token !== 'string') {
    return { props: { valid: false, token: '', errorCode: 'NOT_FOUND', googleClientId } };
  }

  // 同一 Next.js プロセス内なので HTTP 越しに自 API を叩かず DB を直接引く。
  // App Runner (PRIVATE_ISOLATED) から自ドメインへの外周 fetch は
  // インターネット egress に依存して失敗する。
  try {
    const db = await getDb();
    const [invitation] = await db
      .select({
        email: invitationTokens.email,
        role: invitationTokens.role,
        expiresAt: invitationTokens.expiresAt,
        usedAt: invitationTokens.usedAt,
      })
      .from(invitationTokens)
      .where(eq(invitationTokens.token, token))
      .limit(1);

    if (!invitation) {
      return { props: { valid: false, token, errorCode: 'NOT_FOUND', googleClientId } };
    }
    if (invitation.usedAt) {
      return { props: { valid: false, token, errorCode: 'INVITE_USED', googleClientId } };
    }
    if (new Date(invitation.expiresAt) <= new Date()) {
      return { props: { valid: false, token, errorCode: 'INVITE_EXPIRED', googleClientId } };
    }

    return {
      props: {
        valid: true,
        token,
        email: invitation.email,
        role: invitation.role,
        googleClientId,
      },
    };
  } catch (err) {
    logger.error({
      event: 'invite.ssr.db.error',
      err: err instanceof Error ? err.message : String(err),
    });
    return { props: { valid: false, token, errorCode: 'NOT_FOUND', googleClientId } };
  }
};
