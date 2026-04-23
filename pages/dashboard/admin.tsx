// /dashboard/admin - 管理者ダッシュボード
// Phase 2: タブ構造 (タイムライン / タスク / 時間割)
// タイムラインタブ内に教員ステータス表 + 共有タイムライン
import { withAuthSSR } from '@/features/auth/lib/withAuthSSR';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import { Tabs, type TabDef } from '@/shared/components/Tabs';
import { AlertBanner } from '@/features/admin-dashboard/components/AlertBanner';
import { useAdminAlerts } from '@/features/admin-dashboard/hooks/useAdminAlerts';
import { AdminTimelineTab } from '@/features/dashboard/components/AdminTimelineTab';
import { TasksTab } from '@/features/dashboard/components/TasksTab';
import { ScheduleTab } from '@/features/dashboard/components/ScheduleTab';
import type { VitanotaSession } from '@/shared/types/auth';

interface AdminDashboardProps {
  session: VitanotaSession;
}

export default function AdminDashboard({ session }: AdminDashboardProps) {
  const { alerts } = useAdminAlerts();
  const openAlertCount = alerts?.length ?? 0;

  const tabs: TabDef[] = [
    { id: 'timeline', label: 'タイムライン', content: <AdminTimelineTab /> },
    { id: 'tasks', label: 'タスク', content: <TasksTab /> },
    {
      id: 'schedule',
      label: '今週の時間割',
      content: <ScheduleTab />,
      disabled: true,
    },
  ];

  return (
    <TenantGuard session={session}>
      <RoleGuard
        session={session}
        requiredRole="school_admin"
        fallback={
          <div className="py-20 text-center text-gray-500">
            アクセス権限がありません
          </div>
        }
      >
        <Layout session={session}>
          <div className="py-6" data-testid="admin-dashboard-page">
            <AlertBanner openCount={openAlertCount} />
            <Tabs tabs={tabs} defaultTabId="timeline" />
          </div>
        </Layout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps = withAuthSSR({ requireRole: 'school_admin' });
