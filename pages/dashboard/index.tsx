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
import Link from 'next/link';
import {
  PenLine,
  NotebookPen,
  Users,
  ListChecks,
  BookUser,
  GraduationCap,
  LayoutDashboard,
  BarChart3,
} from 'lucide-react';
import { eq } from 'drizzle-orm';
import { withAuthSSR } from '@/features/auth/lib/withAuthSSR';
import { isAiChatEnabledForTenant } from '@/features/ai-chat/featureFlag';
import { withTenantUser } from '@/shared/lib/db';
import { tenants } from '@/db/schema';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import { Modal } from '@/shared/components/Modal';
import { Tabs, type TabDef } from '@/shared/components/Tabs';
import { TasksTabWithCalendar } from '@/features/calendar/components/TasksTabWithCalendar';
import { StaffroomBoard } from '@/features/staffroom/components/StaffroomBoard';
import { SchoolEngagementTab } from '@/features/dashboard/components/SchoolEngagementTab';
import { TodayCaptureBox } from '@/features/journal/components/TodayCaptureBox';
import { DiaryNoteBox } from '@/features/journal/components/DiaryNoteBox';
import { PublicTimelineRail } from '@/features/dashboard/components/PublicTimelineRail';
import { MyNotesByKind } from '@/features/dashboard/components/MyNotesByKind';
import { StudentNotesByClass } from '@/features/dashboard/components/StudentNotesByClass';
import {
  getMoodIcon,
  getMoodLabel,
} from '@/features/journal/lib/mood-options';
import { canUseAdminFeatures } from '@/features/auth/lib/role-helpers';
import type { MoodLevel } from '@/features/journal/schemas/journal';
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
    <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50/40 px-5 py-3 text-xs leading-relaxed text-slate-600">
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

function RecordEntrances({
  onWrite,
  onDiary,
  onOpenRail,
  testIdPrefix = 'quick-record',
}: {
  onWrite: () => void;
  onDiary: () => void;
  // narrow のみ: 渡すと「職員室ノート」を見るボタンを入口 2 つと同じ行に並べる
  // (xl は右レーンが常時表示なので渡さない → 3 つ目は出ない)。
  onOpenRail?: () => void;
  // narrow / xl の 2 箇所に同コンポーネントを置くため testId を出し分け
  // (Playwright strict mode の重複検出回避)。
  testIdPrefix?: string;
}) {
  // chimo 2026-06-12: 記録入口を右サイドに一本化。
  //   入口2「今日の出来事を書く」= 雑に書いて種別を選ぶ単一キャプチャ箱 (TodayCaptureBox)。
  //   入口1「自分用の日誌」= EntryForm を kind='diary' で開く (自分用・既定非公開)。
  // testId は `${prefix}-tweet` を維持して既存 e2e (02-journal-crud, 04-tags) との互換を保つ。
  return (
    <div className="mb-3" data-testid={`${testIdPrefix}-actions`}>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onWrite}
          data-testid={`${testIdPrefix}-tweet`}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[20px] border-2 border-amber-500 bg-amber-50 px-3 py-2.5 text-center text-[13px] font-medium leading-tight text-amber-700 shadow-sm transition-all hover:bg-amber-100 hover:shadow-md"
        >
          <PenLine size={14} strokeWidth={1.75} className="shrink-0" aria-hidden />
          職員室に投稿する
        </button>
        <button
          type="button"
          onClick={onDiary}
          data-testid={`${testIdPrefix}-diary`}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[20px] border-2 border-sky-400 bg-sky-50 px-3 py-2.5 text-center text-[13px] font-medium leading-tight text-sky-700 shadow-sm transition-all hover:bg-sky-100 hover:shadow-md"
        >
          <NotebookPen size={14} strokeWidth={1.75} className="shrink-0" aria-hidden />
          日々ノートを書く
        </button>
        {onOpenRail && (
          <button
            type="button"
            onClick={onOpenRail}
            data-testid="dashboard-open-note-rail-modal-button"
            aria-label="職員室ノートを見る"
            className="inline-flex shrink-0 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-[20px] border-2 border-vn-border-strong bg-white px-3 py-1.5 text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:shadow-md"
          >
            <Users size={18} strokeWidth={1.75} className="shrink-0" aria-hidden />
            <span className="text-[10px] font-medium leading-none">職員室ノート</span>
          </button>
        )}
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500">
        日々のつぶやき、生徒の様子、相談したいことなどを残せます。
        <br />
        小さな出来事が、 他の先生の気づきになることも。
      </p>
    </div>
  );
}

export default function DashboardPage({
  session,
  aiChatEnabled,
  tenantName,
  todayDate,
}: DashboardPageProps) {
  const isAdmin = canUseAdminFeatures(session.user.roles);

  // 記録入口モーダル状態 (chimo 2026-06-12: 右サイドに一本化)。
  //   capture = 今日の出来事 (TodayCaptureBox / 雑入力 + 種別)
  //   diary   = 自分用の日誌 (EntryForm kind='diary')
  const [captureModalOpen, setCaptureModalOpen] = useState(false);
  const [diaryModalOpen, setDiaryModalOpen] = useState(false);
  // narrow (< xl) 用の日々ノートモーダル状態 (chimo 2026-05-21)
  const [noteRailModalOpen, setNoteRailModalOpen] = useState(false);

  const handleOpenCapture = () => setCaptureModalOpen(true);
  const handleOpenDiary = () => setDiaryModalOpen(true);

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
      // chimo 2026-06-11 関係図: マイノートを kind 別に並べる (個人の作業場)。
      id: 'my-notes',
      label: 'マイノート',
      icon: <BookUser size={18} strokeWidth={1.75} aria-hidden />,
      content: <MyNotesByKind />,
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
      // chimo 2026-06-14: 職員室ボード(循環の出口)は生徒ノートの後ろに。
      id: 'staffroom',
      label: '職員室ボード',
      icon: <LayoutDashboard size={18} strokeWidth={1.75} aria-hidden />,
      content: <StaffroomBoard />,
    },
  ];

  if (isAdmin) {
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
            className="grid grid-cols-1 gap-7 pb-6 xl:grid-cols-[minmax(0,1fr)_440px]"
            data-testid="dashboard-page"
          >
            <div className="min-w-0">
              {/* narrow (< xl) 専用: 記録入口 2 つ + 職員室ノート閲覧を 1 行横並び。
                  xl 以上では右レーン上部に集約 (chimo 2026-05-21) */}
              <div className="mb-4 xl:hidden">
                <RecordEntrances
                  onWrite={handleOpenCapture}
                  onDiary={handleOpenDiary}
                  onOpenRail={() => setNoteRailModalOpen(true)}
                  testIdPrefix="narrow-quick-record"
                />
              </div>
              {/* タスク雑入力フォーム (TaskCreateTabs) は タスクボードタブの一番上へ移設
                  (chimo 2026-06-12)。 タスク文脈の入口を board の中に収める。 */}
              <Tabs tabs={mainTabs} defaultTabId="tasks" queryParam="tab" />
            </div>
            <div className="hidden xl:block">
              {/* 記録入口は右レーン上部に集約 (chimo 2026-05-20)。
                  「書く → 公開する → 職員室ノートに並ぶ」 動線を視覚的に直結。 */}
              <RecordEntrances
                onWrite={handleOpenCapture}
                onDiary={handleOpenDiary}
              />
              <PublicTimelineRail selfUserId={session.user.userId} />
            </div>
          </div>

          {/* narrow 用日々ノートモーダル (chimo 2026-05-21): xl 未満では右レーンが
              畳まれるため、 ボタンから rail を呼び出す。 mode='modal' で
              sticky / max-h を抑制し、 Modal の枠に表示を委ねる。 */}
          <Modal
            open={noteRailModalOpen}
            onClose={() => setNoteRailModalOpen(false)}
            title="職員室ノート"
            maxWidth="max-w-2xl"
          >
            <PublicTimelineRail
              selfUserId={session.user.userId}
              mode="modal"
            />
          </Modal>

          {/* 入口2: 今日の出来事 (雑入力 + 種別ルーティング)。投稿後の一覧更新は
              TodayCaptureBox 内で行う (SWR mutate)。 */}
          <Modal
            open={captureModalOpen}
            onClose={() => setCaptureModalOpen(false)}
            title={
              <span className="inline-flex items-center gap-2">
                <PenLine size={20} strokeWidth={1.75} className="text-gray-900" aria-hidden />
                職員室ノートに投稿する
              </span>
            }
            maxWidth="max-w-xl"
          >
            {captureModalOpen && (
              <TodayCaptureBox
                aiChatEnabled={aiChatEnabled}
                onSuccess={() => setCaptureModalOpen(false)}
              />
            )}
          </Modal>

          {/* 入口1: 自分用の日々ノート (diary 固定・常に非公開)。職員室ノートと同じ体裁。 */}
          <Modal
            open={diaryModalOpen}
            onClose={() => setDiaryModalOpen(false)}
            title={
              <span className="inline-flex items-center gap-2">
                <NotebookPen size={20} strokeWidth={1.75} className="text-gray-900" aria-hidden />
                自分用の日々ノートを書く
              </span>
            }
            maxWidth="max-w-xl"
          >
            {diaryModalOpen && (
              <DiaryNoteBox onSuccess={() => setDiaryModalOpen(false)} />
            )}
          </Modal>
        </Layout>
      </RoleGuard>
    </TenantGuard>
  );
}

function ModalMoodTitle({
  mood,
  prompt,
}: {
  mood: MoodLevel;
  prompt: string;
}) {
  const Icon = getMoodIcon(mood);
  const label = getMoodLabel(mood);
  return (
    <span className="flex items-center gap-2 font-normal">
      {Icon && (
        <Icon
          size={20}
          strokeWidth={1.75}
          className="text-gray-700"
          aria-label={label ?? 'mood'}
        />
      )}
      <span>{prompt}</span>
    </span>
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
