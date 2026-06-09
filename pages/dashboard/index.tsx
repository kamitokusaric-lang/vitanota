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
import { useSWRConfig } from 'swr';
import { PenLine, Sunrise } from 'lucide-react';
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
import { SchoolEngagementTab } from '@/features/dashboard/components/SchoolEngagementTab';
import { EntryForm } from '@/features/journal/components/EntryForm';
import { TaskCreateTabs } from '@/features/ai-chat/TaskCreateTabs';
import { PublicTimelineRail } from '@/features/dashboard/components/PublicTimelineRail';
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

function QuickRecordCta({
  onClick,
  testIdPrefix = 'quick-record',
}: {
  onClick: () => void;
  // narrow / xl の 2 箇所に同コンポーネントを置くため testId を出し分け
  // (Playwright strict mode の重複検出回避)。
  testIdPrefix?: string;
}) {
  // 2026-05-27: 旧 3 ボタン (日誌 / ナレッジ / つぶやき) を単一 CTA に統合 (H6/H8 検証)。
  // testId は `${prefix}-tweet` を維持して既存 e2e (02-journal-crud, 04-tags) との互換を保つ。
  // ボタン下に補助文を表示し、 「何を書く場所か」 を Modal を開く前に伝える (chimo 指示)。
  return (
    <div className="mb-3" data-testid={`${testIdPrefix}-actions`}>
      <button
        type="button"
        onClick={onClick}
        data-testid={`${testIdPrefix}-tweet`}
        className="inline-flex items-center gap-2 rounded-[20px] bg-vn-accent px-4 py-2.5 text-[13px] font-medium text-white shadow-sm transition-all hover:bg-indigo-700 hover:shadow-md"
      >
        <PenLine size={14} strokeWidth={1.75} aria-hidden />
        今日の出来事を書く
      </button>
      <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500">
        生徒の様子、 よかったこと、 気になったことなどを残せます。
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
}: DashboardPageProps) {
  const isAdmin = canUseAdminFeatures(session.user.roles);
  const { mutate: globalMutate } = useSWRConfig();

  // 投稿入口 (右上「ひとこと残す」CTA) 経由のモーダル状態。
  // 2026-05-27: 旧 kind 別 modal を単一 CTA + 単一 Modal に統合。
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  // narrow (< xl) 用の日々ノートモーダル状態 (chimo 2026-05-21)
  const [noteRailModalOpen, setNoteRailModalOpen] = useState(false);

  const handleOpenEntryModal = () => setEntryModalOpen(true);

  // create 後の SWR cache 更新。 chimo 2026-05-21: server fetch を待つと
  // 体感ラグが出るため、 楽観的更新で新エントリを即座に右レーンへ反映し、
  // server 整形済みデータは背後で revalidate して上書きする。
  const handleEntrySuccess = async (
    result?: import('@/features/journal/components/EntryForm').EntrySaveResult,
  ) => {
    setEntryModalOpen(false);

    if (!result?.entry) {
      void globalMutate(
        (key) =>
          typeof key === 'string' &&
          (key.startsWith('/api/private/journal/entries') ||
            key.startsWith('/api/public/journal/entries')),
        undefined,
        { revalidate: true },
      );
      return;
    }

    const optimistic = {
      id: result.entry.id,
      userId: result.entry.userId,
      content: result.entry.content,
      createdAt:
        typeof result.entry.createdAt === 'string'
          ? result.entry.createdAt
          : new Date(result.entry.createdAt).toISOString(),
      isPublic: result.entry.isPublic,
      mood: result.entry.mood,
      kind: result.entry.kind,
      authorName: session.user.name,
      authorNickname: null,
      tags: result.tags,
      knowledgeTags: [],
      reactions: {
        knowledge:    { count: 0, mine: false },
        appreciation: { count: 0, mine: false },
        endorsement:  { count: 0, mine: false },
      },
    };

    type RailCache = { entries: typeof optimistic[] } | undefined;
    const prepend = (current: RailCache): RailCache =>
      current
        ? {
            ...current,
            entries: [
              optimistic,
              ...current.entries.filter((e) => e.id !== optimistic.id),
            ],
          }
        : current;

    // SWR key は PublicTimelineRail.tsx の RAIL_PAGE_SIZE=50 と同じ URL 文字列
    const MINE_KEY = '/api/private/journal/entries/mine?page=1&perPage=50';
    const STAFFROOM_KEY = '/api/public/journal/entries?page=1&perPage=50';

    // revalidate: false — POST 直前に開始してた古い in-flight GET の結果で
    // 楽観的更新が上書きされる race を避ける (chimo 2026-05-21 報告)。
    // server 側の最新は 30s refreshInterval / revalidateOnFocus で sync される。
    void globalMutate(MINE_KEY, prepend, { revalidate: false });
    if (result.entry.isPublic) {
      void globalMutate(STAFFROOM_KEY, prepend, { revalidate: false });
    }
  };

  const mainTabs: TabDef[] = [
    {
      id: 'tasks',
      label: 'タスクボード',
      content: <TasksTabWithCalendar selfUserId={session.user.userId} />,
    },
    {
      // chimo 2026-05-20: マイノートタブ削除 (右レーンの「マイノート」 タブで代替) →
      // 代わりにマイレポートを準備中で出す。 中身は disabled なので表示されない。
      id: 'my-report',
      label: 'マイレポート',
      content: null,
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
          {/* chimo 2026-05-20: ダッシュボードを 2 カラム化。 右レーンに「公開中の日々ノート」 を常時。
              踏み絵: 観測感を作らないため mood は出さず、 文言は柔らかく (PublicTimelineRail 参照)。 */}
          <div
            className="grid grid-cols-1 gap-7 pb-6 xl:grid-cols-[minmax(0,1fr)_360px]"
            data-testid="dashboard-page"
          >
            <div className="min-w-0">
              {/* 朝のバトン (H7) への導線。グローバルナビ未整備のため dashboard から1本 (chimo 2026-06-08) */}
              <Link
                href="/baton-relay"
                className="mb-4 flex items-center gap-2 rounded-vn border border-vn-border bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                data-testid="dashboard-baton-relay-link"
              >
                <Sunrise size={18} className="text-vn-accent" aria-hidden />
                朝のバトン — 気になる子に印と一言を残す
              </Link>
              {/* narrow (< xl) 専用: 記録入口 pill + 日々ノートモーダル呼出ボタン。
                  xl 以上では右レーン上部に集約 (chimo 2026-05-21) */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 xl:hidden">
                <QuickRecordCta
                  onClick={handleOpenEntryModal}
                  testIdPrefix="narrow-quick-record"
                />
                <button
                  type="button"
                  onClick={() => setNoteRailModalOpen(true)}
                  className="inline-flex h-9 shrink-0 items-center rounded-full border border-vn-border-strong bg-white px-4 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50"
                  data-testid="dashboard-open-note-rail-modal-button"
                >
                  職員室ノート / マイノート
                </button>
              </div>
              {/* タスク追加カードを入口として先頭に出す (chimo 2026-05-20)。
                  朝カード (H3-B) は 2026-05-30 に撤去 (役割を calendar に統合)。 */}
              <TaskCreateTabs
                selfUserId={session.user.userId}
                aiChatEnabled={aiChatEnabled}
              />
              <Tabs tabs={mainTabs} defaultTabId="tasks" queryParam="tab" />
            </div>
            <div className="hidden xl:block">
              {/* 記録入口は右レーン上部に集約 (chimo 2026-05-20)。
                  「書く → 公開する → 職員室ノートに並ぶ」 動線を視覚的に直結。 */}
              <QuickRecordCta onClick={handleOpenEntryModal} />
              <PublicTimelineRail selfUserId={session.user.userId} />
            </div>
          </div>

          {/* narrow 用日々ノートモーダル (chimo 2026-05-21): xl 未満では右レーンが
              畳まれるため、 ボタンから rail を呼び出す。 mode='modal' で
              sticky / max-h を抑制し、 Modal の枠に表示を委ねる。 */}
          <Modal
            open={noteRailModalOpen}
            onClose={() => setNoteRailModalOpen(false)}
            title="職員室ノート / マイノート"
            maxWidth="max-w-2xl"
          >
            <PublicTimelineRail
              selfUserId={session.user.userId}
              mode="modal"
            />
          </Modal>

          <Modal
            open={entryModalOpen}
            onClose={() => setEntryModalOpen(false)}
            title="今日の出来事を書く"
            maxWidth="max-w-xl"
          >
            {entryModalOpen && (
              <EntryForm
                mode="create"
                onSuccess={handleEntrySuccess}
                onCancel={() => setEntryModalOpen(false)}
              />
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
    return {
      props: {
        aiChatEnabled: isAiChatEnabledForTenant(tenantId),
        tenantName,
      },
    };
  },
});
