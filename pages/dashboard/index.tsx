// /dashboard - 統合ダッシュボード (chimo 2026-07-02 デザイン刷新)。
// ナビは左サイドバー (DashboardSidebarLayout)、 モバイルは下部タブナビ (BottomTabNav)。
// Tabs は hideTabList でパネルのみ描画し、 遷移は外側のナビが ?tab= で駆動する。
// タブ (サイドバー並び順):
//   1. 職員室でつぶやく    (staffroom-notes) = 職員室ノート。default。メインへ昇格 (旧・右レーン)。
//   2. 会議で話す      (staffroom)       = 職員室ボード。
//   ── 区切り ──
//   3. 自分をふりかえる (my-notes)        = 今日のふりかえり + マイノート。
//   4. 生徒を観察する   (student-notes)   = 生徒ノート (朝バトンを学年別)。
//   5. タスク整理する   (tasks)           = タスクボード。
//   ( 学校レポート (engagement) は school_admin のみ・showSchoolReport で現在非表示。 )
import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import {
  ListChecks,
  BookOpen,
  GraduationCap,
  CalendarCheck,
  BarChart3,
  Users,
} from 'lucide-react';
import { BottomTabNav } from '@/shared/components/BottomTabNav';
import { eq } from 'drizzle-orm';
import { withAuthSSR } from '@/features/auth/lib/withAuthSSR';
import { isAiChatEnabledForTenant } from '@/features/ai-chat/featureFlag';
import { withTenantUser } from '@/shared/lib/db';
import { tenants } from '@/db/schema';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import {
  DashboardSidebarLayout,
  type SidebarNavItem,
} from '@/shared/components/DashboardSidebarLayout';
import { Tabs, type TabDef } from '@/shared/components/Tabs';
import { TasksTabWithCalendar } from '@/features/calendar/components/TasksTabWithCalendar';
import { StaffroomBoard } from '@/features/staffroom/components/StaffroomBoard';
import { SchoolEngagementTab } from '@/features/dashboard/components/SchoolEngagementTab';
import { TodayReflectionCard } from '@/features/journal/components/TodayReflectionCard';
import { PublicTimelineRail } from '@/features/dashboard/components/PublicTimelineRail';
import { MyNotesByKind } from '@/features/dashboard/components/MyNotesByKind';
import { StudentNotesByClass } from '@/features/dashboard/components/StudentNotesByClass';
import { canUseAdminFeatures, canUseSystemAdminFeatures } from '@/features/auth/lib/role-helpers';
import type { VitanotaSession } from '@/shared/types/auth';

interface DashboardPageProps {
  session: VitanotaSession;
  aiChatEnabled: boolean;
  tenantName: string;
  todayDate: string; // JST の今日 (YYYY-MM-DD・生徒ノートの朝バトン埋め込み用)
}

function ComingSoonTab({ label }: { label: string }) {
  return (
    <div className="py-16 text-center text-sm text-gray-400">
      {label} は準備中です
    </div>
  );
}

// H1 検証中: 教員に「AI が育つ過程である」ことを伝える注意書き。
// 「観測されてる」感ではなく「教員 → AI」方向の関係を提示するための文言 (chimo 設計 2026-05-13)。
function AiLearningNotice({ tenantName }: { tenantName: string }) {
  return (
    <div className="mb-4 rounded-lg border border-vn-accent/30 bg-vn-accent-bg px-5 py-3 text-xs leading-relaxed text-slate-600">
      <p>
        チャットで雑に呟くだけで、タスク登録ができます。一人につき、一日20件まで呟けます。
      </p>
      <p className="mt-1">
        まだ未熟なAIなので間違いを教えてあげることで、{tenantName}の仕事を覚えます。
      </p>
      <p className="mt-1">
        タスク名・期限・カテゴリが違っているときは、直して登録することでAIが間違いに気づきます。
      </p>
      <p className="mt-1">新人AIなので優しくしてあげてください。</p>
      <p className="mt-1">
        手動登録がしたい場合は、右上の「手動でタスク追加する」をクリックしてください。
      </p>
    </div>
  );
}

// 各タブの上部ヘッダーバーに出す説明文 (chimo 2026-07-02)。
// 「<機能の実体> ・ <ひとこと>」の形。 設計語彙 (整える/しまう/残す/渡す) 寄りで、
// 分析/評価/最適化は使わない。
const TAB_DESCRIPTIONS: Record<string, string> = {
  'staffroom-notes': '職員室ノート ・ コミュニケーションの場',
  staffroom: '職員室ボード ・ 会議で話したいことを持ち寄る',
  'my-notes': 'マイノート ・ 今日をふりかえる',
  'student-notes': '生徒ノート ・ 生徒たちの様子を書きとめる',
  tasks: 'タスクボード ・ やることを整える',
};

// モバイル下部タブナビの 5 タブ (chimo 2026-07-02 刷新: サイドバーと同順・短ラベル)。
const MOBILE_TABS = [
  { id: 'staffroom-notes', label: 'つぶやき', icon: <Users size={20} strokeWidth={1.75} aria-hidden /> },
  { id: 'staffroom', label: '会議', icon: <CalendarCheck size={20} strokeWidth={1.75} aria-hidden /> },
  { id: 'my-notes', label: 'ふりかえり', icon: <BookOpen size={20} strokeWidth={1.75} aria-hidden /> },
  { id: 'student-notes', label: '生徒', icon: <GraduationCap size={20} strokeWidth={1.75} aria-hidden /> },
  { id: 'tasks', label: 'タスク', icon: <ListChecks size={20} strokeWidth={1.75} aria-hidden /> },
];

export default function DashboardPage({
  session,
  aiChatEnabled,
  tenantName,
  todayDate,
}: DashboardPageProps) {
  const isAdmin = canUseAdminFeatures(session.user.roles);

  const router = useRouter();
  // 現在のタブ (?tab=)。未指定は staffroom-notes (職員室でつぶやく = 職員室ノート)。
  const activeTab =
    typeof router.query.tab === 'string' ? router.query.tab : 'staffroom-notes';
  const mainTabs: TabDef[] = [
    {
      // 職員室でつぶやく: 職員室ノート。旧・右レーンからメインへ昇格。default。
      id: 'staffroom-notes',
      label: '職員室でつぶやく',
      icon: <Users size={18} strokeWidth={1.75} aria-hidden />,
      content: (
        <PublicTimelineRail
          selfUserId={session.user.userId}
          mode="page"
          aiChatEnabled={aiChatEnabled}
          authorName={session.user.name}
          isAiAuthor={canUseSystemAdminFeatures(session.user.roles)}
          canModerate={isAdmin}
        />
      ),
    },
    {
      // 会議で話す: 職員室ボード。
      id: 'staffroom',
      label: '会議で話す',
      icon: <CalendarCheck size={18} strokeWidth={1.75} aria-hidden />,
      content: <StaffroomBoard />,
    },
    {
      // 自分をふりかえる: 今日のふりかえり + マイノートを kind 別に (個人の作業場)。
      id: 'my-notes',
      label: '自分をふりかえる',
      icon: <BookOpen size={18} strokeWidth={1.75} aria-hidden />,
      content: (
        <div className="space-y-6">
          <TodayReflectionCard />
          <MyNotesByKind />
        </div>
      ),
    },
    {
      // 生徒を観察する: 生徒ノート (朝バトンのクラスを学年別に)。
      id: 'student-notes',
      label: '生徒を観察する',
      icon: <GraduationCap size={18} strokeWidth={1.75} aria-hidden />,
      content: (
        <StudentNotesByClass
          selfUserId={session.user.userId}
          todayDate={todayDate}
        />
      ),
    },
    {
      // タスク整理する: タスクボード。
      id: 'tasks',
      label: 'タスク整理する',
      icon: <ListChecks size={18} strokeWidth={1.75} aria-hidden />,
      content: (
        <TasksTabWithCalendar
          selfUserId={session.user.userId}
          aiChatEnabled={aiChatEnabled}
        />
      ),
    },
  ];

  // 学校レポート (学校エンゲージメント) タブは一旦非表示 (chimo 2026-06-16)。
  // school_admin 専用の組織状態ビュー。ルート (/api/school/*) とコンポーネントは残置し、
  // 再表示は showSchoolReport を true に戻すだけ。
  const showSchoolReport: boolean = false;
  if (isAdmin && showSchoolReport) {
    mainTabs.push({
      id: 'engagement',
      label: '学校レポート',
      icon: <BarChart3 size={18} strokeWidth={1.75} aria-hidden />,
      content: <SchoolEngagementTab />,
    });
  }

  // 左サイドバー用のナビ項目 (mainTabs と同じ並び)。グループ2 (自分をふりかえる〜) の前に区切り線。
  const navItems: SidebarNavItem[] = mainTabs.map((t) => ({
    id: t.id,
    label: t.label,
    icon: t.icon,
    dividerAfter: t.id === 'staffroom',
  }));

  const activeLabel =
    mainTabs.find((t) => t.id === activeTab)?.label ?? '職員室でつぶやく';
  const activeDesc = TAB_DESCRIPTIONS[activeTab];

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="teacher">
        <DashboardSidebarLayout
          session={session}
          navItems={navItems}
          activeId={activeTab}
          queryParam="tab"
          title={activeLabel}
          subtitle={activeDesc}
        >
          <div data-testid="dashboard-page">
            {/* タイトル / 説明は上部ヘッダーバー (DashboardSidebarLayout) が担う。
                ここはパネルのみ。ナビは左サイドバー / 下部ナビが ?tab= で駆動。 */}
            <Tabs
              tabs={mainTabs}
              defaultTabId="staffroom-notes"
              queryParam="tab"
              hideTabList
            />
          </div>

          <BottomTabNav tabs={MOBILE_TABS} activeId={activeTab} />
        </DashboardSidebarLayout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps = withAuthSSR<{
  aiChatEnabled: boolean;
  tenantName: string;
  todayDate: string;
}>({
  requireRole: 'teacher',
  async inner(_ctx, session) {
    const tenantId = session.user.tenantId!;
    const role =
      session.user.roles.find((r) => r === 'school_admin' || r === 'teacher') ??
      'teacher';
    // RLS を通すため withTenantUser でロールセット
    const tenantName = await withTenantUser(
      tenantId,
      session.user.userId,
      role,
      async (tx) => {
        const rows = await tx
          .select({ name: tenants.name })
          .from(tenants)
          .where(eq(tenants.id, tenantId));
        return rows[0]?.name ?? '学校';
      },
    );
    // JST の今日 (YYYY-MM-DD)。サーバ TZ が UTC でもズレないよう明示。
    const todayDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
    }).format(new Date());
    return {
      props: {
        aiChatEnabled: isAiChatEnabledForTenant(tenantId),
        tenantName,
        todayDate,
      },
    };
  },
});
