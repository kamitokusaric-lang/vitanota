// /dashboard - 統合ダッシュボード (教員・school_admin 共通 UI)
// 大タブ: マイボード / 職員室ボード / 学校エンゲージメント (school_admin 特権)
// 各大タブ内にサブタブ
import { withAuthSSR } from '@/features/auth/lib/withAuthSSR';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import { Tabs, type TabDef } from '@/shared/components/Tabs';
import { TimelineTab } from '@/features/dashboard/components/TimelineTab';
import { MyTasksTab } from '@/features/dashboard/components/MyTasksTab';
import { StaffroomTasksTab } from '@/features/dashboard/components/StaffroomTasksTab';
import { SchoolEngagementTab } from '@/features/dashboard/components/SchoolEngagementTab';
import { canUseAdminFeatures } from '@/features/auth/lib/role-helpers';
import type { VitanotaSession } from '@/shared/types/auth';

interface DashboardPageProps {
  session: VitanotaSession;
}

function ComingSoonTab({ label }: { label: string }) {
  return (
    <div className="py-16 text-center text-sm text-gray-400">
      {label} は準備中です
    </div>
  );
}

export default function DashboardPage({ session }: DashboardPageProps) {
  const isAdmin = canUseAdminFeatures(session.user.roles);

  const myBoardTabs: TabDef[] = [
    {
      id: 'notes',
      label: '日々ノート',
      content: <TimelineTab session={session} mode="personal" />,
    },
    {
      id: 'tasks',
      label: 'タスクボード',
      content: <MyTasksTab session={session} />,
    },
    {
      id: 'weekly',
      label: '今週のひとこと',
      content: <ComingSoonTab label="今週のひとこと" />,
      disabled: true,
    },
  ];

  const staffroomTabs: TabDef[] = [
    {
      id: 'timeline',
      label: 'みんなの日々ノート',
      content: <TimelineTab session={session} mode="staffroom" />,
    },
    {
      id: 'tasks',
      label: 'みんなのタスクボード',
      content: <StaffroomTasksTab session={session} />,
    },
    {
      id: 'schedule',
      label: '時間割',
      content: <ComingSoonTab label="時間割" />,
      disabled: true,
    },
  ];

  const mainTabs: TabDef[] = [
    {
      id: 'myboard',
      label: 'マイボード',
      content: (
        <Tabs
          tabs={myBoardTabs}
          defaultTabId="notes"
          queryParam="my_tab"
        />
      ),
    },
    {
      id: 'staffroom',
      label: '職員室ボード',
      content: (
        <Tabs
          tabs={staffroomTabs}
          defaultTabId="timeline"
          queryParam="staff_tab"
        />
      ),
    },
  ];

  if (isAdmin) {
    mainTabs.push({
      id: 'engagement',
      label: '学校エンゲージメント',
      content: <SchoolEngagementTab />,
    });
  }

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="teacher">
        <Layout session={session}>
          <div className="py-6" data-testid="dashboard-page">
            <Tabs tabs={mainTabs} defaultTabId="myboard" queryParam="tab" />
          </div>
        </Layout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps = withAuthSSR({ requireRole: 'teacher' });
