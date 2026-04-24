// /dashboard - 統合ダッシュボード (教員・school_admin 共通 UI)
// 2 階層タブ: 大タブ [自分] [全体]、各タブ内に 3 つのサブタブ
// school_admin は teacher 権限を階層的に持つ (requiredRole="teacher")
import { withAuthSSR } from '@/features/auth/lib/withAuthSSR';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import { Tabs, type TabDef } from '@/shared/components/Tabs';
import { TimelineTab } from '@/features/dashboard/components/TimelineTab';
import { MyTasksTab } from '@/features/dashboard/components/MyTasksTab';
import { SchoolWellnessTab } from '@/features/dashboard/components/SchoolWellnessTab';
import { TeachersWorkloadTab } from '@/features/dashboard/components/TeachersWorkloadTab';
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
  const selfTabs: TabDef[] = [
    {
      id: 'times',
      label: 'times',
      content: <TimelineTab session={session} />,
    },
    {
      id: 'tasks',
      label: 'タスク',
      content: <MyTasksTab session={session} />,
    },
    {
      id: 'weekly',
      label: '週次コメント',
      content: <ComingSoonTab label="週次コメント" />,
      disabled: true,
    },
  ];

  const allTabs: TabDef[] = [
    {
      id: 'engage',
      label: '全体エンゲージ',
      content: <SchoolWellnessTab />,
    },
    {
      id: 'workload',
      label: '稼働状況',
      content: <TeachersWorkloadTab />,
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
      id: 'self',
      label: '自分',
      content: (
        <Tabs
          tabs={selfTabs}
          defaultTabId="times"
          queryParam="self_tab"
        />
      ),
    },
    {
      id: 'all',
      label: '全体',
      content: (
        <Tabs
          tabs={allTabs}
          defaultTabId="engage"
          queryParam="all_tab"
        />
      ),
    },
  ];

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="teacher">
        <Layout session={session}>
          <div className="py-6" data-testid="dashboard-page">
            <Tabs tabs={mainTabs} defaultTabId="self" queryParam="tab" />
          </div>
        </Layout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps = withAuthSSR({ requireRole: 'teacher' });
