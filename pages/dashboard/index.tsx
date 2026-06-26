// /dashboard - 統合ダッシュボード (大タブ切替: タスクボード / マイレポート / 学校レポート)
// 大タブはシンプルな underline スタイル (Tabs default variant)
// 各タブ内の構造:
//   - タスクボード: デフォルト「自分」フィルタ、期限早い順、今日期限赤マーク
//   - マイレポート (準備中・disabled)
//   - 学校レポート (school_admin のみ)
// 全タブ共通:
//   - H6/H8/H9 検証中 (2026-05-27): 投稿入口を「ひとこと残す」単一 CTA に統合。
//     旧 3 種別 (日誌 / ナレッジ / つぶやき) は撤去、 新規投稿は kind='tweet' 固定。
//     CTA クリックで Modal が開き、 EntryForm が default 'tweet' で起動する。
import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import {
  ListChecks,
  BookUser,
  GraduationCap,
  LayoutDashboard,
  BarChart3,
  Notebook,
} from 'lucide-react';
import { BottomTabNav } from '@/shared/components/BottomTabNav';
import { eq } from 'drizzle-orm';
import { withAuthSSR } from '@/features/auth/lib/withAuthSSR';
import { isAiChatEnabledForTenant } from '@/features/ai-chat/featureFlag';
import { withTenantUser } from '@/shared/lib/db';
import { tenants } from '@/db/schema';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import { Tabs, type TabDef } from '@/shared/components/Tabs';
import { TasksTabWithCalendar } from '@/features/calendar/components/TasksTabWithCalendar';
import { StaffroomBoard } from '@/features/staffroom/components/StaffroomBoard';
import { SchoolEngagementTab } from '@/features/dashboard/components/SchoolEngagementTab';
import { DiaryNoteBox } from '@/features/journal/components/DiaryNoteBox';
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

// モバイル下部タブナビの 5 タブ (chimo 2026-06-25 スマホ版 design)。
const MOBILE_TABS = [
  { id: 'tasks', label: 'タスク', icon: <ListChecks size={20} strokeWidth={1.75} aria-hidden /> },
  { id: 'staffroom', label: 'ボード', icon: <LayoutDashboard size={20} strokeWidth={1.75} aria-hidden /> },
  { id: 'student-notes', label: '生徒', icon: <GraduationCap size={20} strokeWidth={1.75} aria-hidden /> },
  { id: 'my-notes', label: 'ノート', icon: <BookUser size={20} strokeWidth={1.75} aria-hidden /> },
  { id: 'staffroom-notes', label: '職員室', icon: <Notebook size={20} strokeWidth={1.75} aria-hidden /> },
];

export default function DashboardPage({
  session,
  aiChatEnabled,
  tenantName,
  todayDate,
}: DashboardPageProps) {
  const isAdmin = canUseAdminFeatures(session.user.roles);

  const router = useRouter();
  // モバイル下部ナビ用: 現在のタブ (?tab=)。未指定は tasks。
  const activeTab =
    typeof router.query.tab === 'string' ? router.query.tab : 'tasks';
  const mainTabs: TabDef[] = [
    {
      id: 'tasks',
      label: 'タスクボード',
      icon: <ListChecks size={18} strokeWidth={1.75} aria-hidden />,
      content: (
        <TasksTabWithCalendar
          selfUserId={session.user.userId}
          aiChatEnabled={aiChatEnabled}
        />
      ),
    },
    {
      // chimo 2026-06-26: タブ順を タスク → 職員室ボード → 生徒ノート → マイノート に並べ替え。
      id: 'staffroom',
      label: '職員室ボード',
      icon: <LayoutDashboard size={18} strokeWidth={1.75} aria-hidden />,
      content: <StaffroomBoard />,
    },
    {
      // chimo 2026-06-11 関係図: 生徒ノート (朝バトンのクラスを学年別に)。
      id: 'student-notes',
      label: '生徒ノート',
      icon: <GraduationCap size={18} strokeWidth={1.75} aria-hidden />,
      content: (
        <StudentNotesByClass
          selfUserId={session.user.userId}
          todayDate={todayDate}
        />
      ),
    },
    {
      // chimo 2026-06-11 関係図: マイノートを kind 別に並べる (個人の作業場)。
      // design2 (chimo 2026-06-25): 上部に「今日のふりかえり」入力をインライン展開。
      id: 'my-notes',
      label: 'マイノート',
      icon: <BookUser size={18} strokeWidth={1.75} aria-hidden />,
      content: (
        <div className="space-y-6">
          <section className="rounded-[14px] border border-vn-border bg-vn-surface px-7 pb-4 pt-5 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
            <header className="mb-3">
              <h2 className="text-[20px] font-bold leading-[1.4] text-slate-800">
                📝 今日のふりかえり
              </h2>
            </header>
            <DiaryNoteBox />
          </section>
          <MyNotesByKind />
        </div>
      ),
    },
    {
      // モバイル独立タブ (chimo 2026-06-25): PC は右レーン、モバイルは下部ナビから開く職員室ノート。
      id: 'staffroom-notes',
      label: '職員室ノート',
      hideInTabList: true,
      content: (
        <PublicTimelineRail
          selfUserId={session.user.userId}
          mode="page"
          aiChatEnabled={aiChatEnabled}
          authorName={session.user.name}
          isAiAuthor={canUseSystemAdminFeatures(session.user.roles)}
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

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="teacher">
        <Layout session={session}>
          {/* chimo 2026-05-20: ダッシュボードを 2 カラム化。 右レーンに「公開中の日々ノート」 を常時。
              踏み絵: 観測感を作らないため mood は出さず、 文言は柔らかく (PublicTimelineRail 参照)。 */}
          <div
            className="grid grid-cols-1 gap-7 pb-24 xl:grid-cols-[minmax(0,1fr)_440px] xl:pb-6"
            data-testid="dashboard-page"
          >
            <div className="min-w-0">
              {/* モバイル: 画面名ヘッダ (上部タブを下部ナビに移したため・chimo 2026-06-25) */}
              <div className="mb-4 xl:hidden">
                <h1 className="text-[22px] font-bold text-vn-ink">
                  {mainTabs.find((t) => t.id === activeTab)?.label ?? 'タスクボード'}
                </h1>
              </div>
              <Tabs
                tabs={mainTabs}
                defaultTabId="tasks"
                queryParam="tab"
                hideTabListOnMobile
              />
            </div>
            <div className="hidden xl:block">
              {/* design1 (chimo 2026-06-25): 記録入口 (職員室ノート投稿) を rail 上部に
                  インライン展開。日々ノートは rail 内リンクから。narrow は RecordEntrances。 */}
              <PublicTimelineRail
                selfUserId={session.user.userId}
                aiChatEnabled={aiChatEnabled}
                authorName={session.user.name}
                isAiAuthor={canUseSystemAdminFeatures(session.user.roles)}
              />
            </div>
          </div>

          <BottomTabNav tabs={MOBILE_TABS} activeId={activeTab} />
        </Layout>
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
