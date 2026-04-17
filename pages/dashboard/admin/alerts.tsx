// /dashboard/admin/alerts — アラート一覧（US-A-020・US-A-021）
import { useState } from 'react';
import Link from 'next/link';
import { withAuthSSR } from '@/features/auth/lib/withAuthSSR';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { AlertList } from '@/features/admin-dashboard/components/AlertList';
import { useAdminAlerts } from '@/features/admin-dashboard/hooks/useAdminAlerts';
import type { VitanotaSession } from '@/shared/types/auth';

interface AlertsPageProps {
  session: VitanotaSession;
}

export default function AlertsPage({ session }: AlertsPageProps) {
  const { alerts, error, isLoading, mutate } = useAdminAlerts();
  const [closingId, setClosingId] = useState<string | null>(null);

  const handleClose = async (alertId: string) => {
    setClosingId(alertId);
    try {
      const res = await fetch(`/api/admin/alerts/${alertId}/close`, { method: 'PUT' });
      if (res.ok) {
        await mutate();
      }
    } finally {
      setClosingId(null);
    }
  };

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="school_admin">
        <Layout session={session}>
          <div className="py-6" data-testid="admin-alerts-page">
            <div className="mb-4">
              <Link
                href="/dashboard/admin"
                className="text-sm text-blue-600 hover:underline"
              >
                ← ダッシュボードに戻る
              </Link>
            </div>

            <header className="mb-6">
              <h1 className="text-xl font-bold text-gray-900">アラート</h1>
            </header>

            {error && <ErrorMessage message="アラートの取得に失敗しました" />}

            {isLoading && (
              <div className="py-10 text-center text-sm text-gray-400">読み込み中...</div>
            )}

            {!isLoading && !error && alerts && (
              <AlertList alerts={alerts} onClose={handleClose} closingId={closingId} />
            )}
          </div>
        </Layout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps = withAuthSSR({ requireRole: 'school_admin' });
