// /dashboard/teacher - 教員ダッシュボード
// Phase 2: タブ構造 (タイムライン / タスク / 時間割)
import { withAuthSSR } from '@/features/auth/lib/withAuthSSR';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import { Tabs, type TabDef } from '@/shared/components/Tabs';
import { TimelineTab } from '@/features/dashboard/components/TimelineTab';
import { TasksTab } from '@/features/dashboard/components/TasksTab';
import { ScheduleTab } from '@/features/dashboard/components/ScheduleTab';
import type { VitanotaSession } from '@/shared/types/auth';

interface TeacherDashboardPageProps {
  session: VitanotaSession;
}

export default function TeacherDashboardPage({
  session,
}: TeacherDashboardPageProps) {
  const tabs: TabDef[] = [
    { id: 'timeline', label: 'タイムライン', content: <TimelineTab session={session} /> },
    { id: 'tasks', label: 'タスク', content: <TasksTab session={session} /> },
    {
      id: 'schedule',
      label: '今週の時間割',
      content: <ScheduleTab />,
      disabled: true,
    },
  ];

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="teacher">
        <Layout session={session}>
          <div className="py-6" data-testid="teacher-dashboard-page">
            <Tabs tabs={tabs} defaultTabId="timeline" />
          </div>
        </Layout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps = withAuthSSR();
