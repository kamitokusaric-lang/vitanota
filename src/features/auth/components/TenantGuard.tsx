// SP-04 Layer 3: テナント状態確認
// セッションなし → ログインページへ、停止中 → 停止メッセージ表示
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { signOut } from 'next-auth/react';
import type { VitanotaSession } from '@/shared/types/auth';
import { Button } from '@/shared/components/Button';

interface TenantGuardProps {
  children: React.ReactNode;
  session: VitanotaSession | null;
}

function TenantSuspendedMessage() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 p-8"
      data-testid="tenant-suspended-message"
    >
      <div className="max-w-md rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
        <h2 className="mb-2 text-lg font-semibold text-amber-800">テナント停止中</h2>
        <p className="text-sm text-amber-700">
          このテナントは現在停止中です。管理者にお問い合わせください。
        </p>
      </div>
      <Button
        variant="secondary"
        onClick={() => signOut({ callbackUrl: '/auth/signin' })}
        data-testid="tenant-suspended-signout-button"
      >
        ログアウト
      </Button>
    </div>
  );
}

export function TenantGuard({ children, session }: TenantGuardProps) {
  const router = useRouter();

  useEffect(() => {
    if (!session) {
      router.push('/auth/signin');
    }
  }, [session, router]);

  if (!session) return null;

  if (session.user.tenantStatus === 'suspended') {
    return <TenantSuspendedMessage />;
  }

  return <>{children}</>;
}
