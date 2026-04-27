// /dashboard - 統合ダッシュボード (大タブ切替: 日々ノート / タスクボード / 学校全体の温度)
// 大タブはシンプルな underline スタイル (Tabs default variant)
// 各タブ内の構造:
//   - 日々ノート: 投稿フォーム sticky + 子タブ「みんなの投稿 / わたしの投稿」
//   - タスクボード: デフォルト「自分」フィルタ、期限早い順、今日期限赤マーク
//   - 学校全体の温度 (school_admin のみ)
import { withAuthSSR } from '@/features/auth/lib/withAuthSSR';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import { Tabs, type TabDef } from '@/shared/components/Tabs';
import { TimelineTab } from '@/features/dashboard/components/TimelineTab';
import { TaskBoard } from '@/features/tasks/components/TaskBoard';
import { SchoolEngagementTab } from '@/features/dashboard/components/SchoolEngagementTab';
// 5月リリース送り: WeeklySummaryTab の import は復活時に解除する
// import { WeeklySummaryTab } from '@/features/dashboard/components/WeeklySummaryTab';
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

  const mainTabs: TabDef[] = [
    {
      id: 'notes',
      label: '日々ノート',
      content: <TimelineTab session={session} />,
    },
    {
      id: 'tasks',
      label: 'タスクボード',
      content: <TaskBoard selfUserId={session.user.userId} />,
    },
    {
      id: 'weekly',
      label: '先週のvitanotaレポート',
      // 5月リリース送り: AppRunner VPC egress 不可 (NAT 無し) で Anthropic 接続戦略が未確定。
      // 復活時は ComingSoonTab → <WeeklySummaryTab /> に戻し、上の import コメント解除 + disabled を外す
      content: <ComingSoonTab label="先週のvitanotaレポート" />,
      disabled: true,
    },
    {
      id: 'schedule',
      label: '時間割',
      content: <ComingSoonTab label="時間割" />,
      disabled: true,
    },
  ];

  if (isAdmin) {
    mainTabs.push({
      id: 'engagement',
      label: '学校レポート',
      content: <SchoolEngagementTab />,
    });
  }

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="teacher">
        <Layout session={session}>
          <div className="pb-6 pt-2" data-testid="dashboard-page">
            <Tabs tabs={mainTabs} defaultTabId="notes" queryParam="tab" />
          </div>
        </Layout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps = withAuthSSR({ requireRole: 'teacher' });
