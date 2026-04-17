// /dashboard/admin — 管理者ダッシュボード（US-A-010）
import { useRouter } from 'next/router';
import { withAuthSSR } from '@/features/auth/lib/withAuthSSR';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { TeacherStatusGrid } from '@/features/admin-dashboard/components/TeacherStatusGrid';
import { AlertBanner } from '@/features/admin-dashboard/components/AlertBanner';
import { useTeacherStatuses } from '@/features/admin-dashboard/hooks/useTeacherStatuses';
import { useAdminAlerts } from '@/features/admin-dashboard/hooks/useAdminAlerts';
import type { VitanotaSession } from '@/shared/types/auth';

interface AdminDashboardProps {
  session: VitanotaSession;
}

export default function AdminDashboard({ session }: AdminDashboardProps) {
  const router = useRouter();
  const { teachers, error: teachersError, isLoading: teachersLoading } = useTeacherStatuses();
  const { alerts, error: alertsError } = useAdminAlerts();

  const openAlertCount = alerts?.length ?? 0;

  return (
    <TenantGuard session={session}>
      <RoleGuard
        session={session}
        requiredRole="school_admin"
        fallback={
          <div className="py-20 text-center text-gray-500">アクセス権限がありません</div>
        }
      >
        <Layout session={session}>
          <div className="py-6" data-testid="admin-dashboard-page">
            <header className="mb-6">
              <h1 className="text-xl font-bold text-gray-900">管理者ダッシュボード</h1>
              <p className="mt-1 text-sm text-gray-500">
                テナント内の教員のコンディションを確認できます
              </p>
            </header>

            <AlertBanner openCount={openAlertCount} />

            {teachersError && <ErrorMessage message="教員データの取得に失敗しました" />}
            {alertsError && <ErrorMessage message="アラートデータの取得に失敗しました" />}

            {teachersLoading && (
              <div className="py-10 text-center text-sm text-gray-400">読み込み中...</div>
            )}

            {!teachersLoading && !teachersError && teachers && (
              <TeacherStatusGrid
                teachers={teachers}
                onTeacherClick={(userId) => router.push(`/dashboard/admin/teacher/${userId}`)}
              />
            )}
          </div>
        </Layout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps = withAuthSSR({ requireRole: 'school_admin' });
