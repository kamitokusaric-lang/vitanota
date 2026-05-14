// /dashboard - 統合ダッシュボード (大タブ切替: タスクボード / 日々ノート / 学校全体の温度)
// 大タブはシンプルな underline スタイル (Tabs default variant)
// 各タブ内の構造:
//   - タスクボード: デフォルト「自分」フィルタ、期限早い順、今日期限赤マーク
//   - 日々ノート: 投稿フォーム sticky + 子タブ「みんなの投稿 / わたしの投稿」
//   - 学校全体の温度 (school_admin のみ)
// 全タブ共通:
//   - H1 検証中: AI タスク整理を主役に。哲学挨拶 (PhilosophyGreeting) は一旦外し、
//     3 種別の投稿入口は右上の小さい補助導線 (pill) に縮約。
//   - ピルクリックで Modal が開き、EntryForm に kind pre-set 状態で投稿できる
import { useState } from 'react';
import { useSWRConfig } from 'swr';
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
import { TimelineTab } from '@/features/dashboard/components/TimelineTab';
import { PhilosophyGreeting } from '@/features/dashboard/components/PhilosophyGreeting';
import { TaskBoard } from '@/features/tasks/components/TaskBoard';
import { SchoolEngagementTab } from '@/features/dashboard/components/SchoolEngagementTab';
import { EntryForm } from '@/features/journal/components/EntryForm';
import { TaskCreateTabs } from '@/features/ai-chat/TaskCreateTabs';
import { MorningPlanSection } from '@/features/ai-chat/morning-plan/MorningPlanSection';
import {
  getMoodIcon,
  getMoodLabel,
  pickRandomPromptFor,
} from '@/features/journal/lib/mood-options';
import { canUseAdminFeatures } from '@/features/auth/lib/role-helpers';
import type {
  JournalEntryKind,
  MoodLevel,
} from '@/features/journal/schemas/journal';
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

// H1 検証中の補助導線: 日誌・ナレッジ・つぶやきを右上に小さく寄せる
const RECORD_KINDS: { kind: JournalEntryKind; label: string }[] = [
  { kind: 'diary', label: '日誌' },
  { kind: 'knowledge', label: 'ナレッジ' },
  { kind: 'tweet', label: 'つぶやき' },
];

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

function QuickRecordActions({
  onPick,
}: {
  onPick: (kind: JournalEntryKind) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-end gap-2.5">
      <span className="text-xs font-bold text-slate-400">今日の記録</span>
      {RECORD_KINDS.map(({ kind, label }) => (
        <button
          key={kind}
          type="button"
          onClick={() => onPick(kind)}
          data-testid={`quick-record-${kind}`}
          className="inline-flex h-9 items-center rounded-full border border-slate-300 bg-white px-3.5 text-xs font-extrabold text-slate-600 transition hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-50"
        >
          {label}
        </button>
      ))}
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

  // 投稿入口 (PhilosophyGreeting 内の 3 アイコン) 経由のモーダル状態 (kind 別に Modal を切替)
  const [entryModal, setEntryModal] = useState<
    { open: false } | { open: true; kind: JournalEntryKind }
  >({ open: false });

  const handleKindPick = (kind: JournalEntryKind) => {
    setEntryModal({ open: true, kind });
  };

  const modalTitleByKind: Record<JournalEntryKind, string> = {
    diary: '今の気分を選んでください',
    knowledge: 'ナレッジノート',
    tweet: '軽いつぶやき',
  };

  const handleEntrySuccess = async () => {
    setEntryModal({ open: false });
    // 共有タイムライン / マイ記録の SWR キャッシュを invalidate して再 fetch
    // ($inf$ キーは matcher 関数からは届かないが、TimelineTab 子側が
    // revalidateOnFocus / revalidateOnMount で natural に再取得する)
    await globalMutate(
      (key) =>
        typeof key === 'string' &&
        (key.startsWith('/api/private/journal/entries') ||
          key.startsWith('/api/public/journal/entries')),
      undefined,
      { revalidate: true },
    );
  };

  const mainTabs: TabDef[] = [
    {
      id: 'tasks',
      label: 'タスクボード',
      content: <TaskBoard selfUserId={session.user.userId} />,
    },
    {
      id: 'notes',
      label: '日々ノート',
      content: <TimelineTab session={session} />,
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
          <div className="pb-6" data-testid="dashboard-page">
            {/* H1 検証中: 哲学挨拶 (PhilosophyGreeting) は一旦外して AI タスク整理を主役に。
                3 種別の投稿入口は QuickRecordActions として右上に補助導線で寄せる。 */}
            <QuickRecordActions onPick={handleKindPick} />
            {/* H3 朝の見通し作り (2026-05-14): AI 機能 ON のテナントだけに表示、
                feature flag (allowlist) は API 側でも 404 を返すので二重防御。 */}
            {aiChatEnabled && <MorningPlanSection />}
            <TaskCreateTabs
              selfUserId={session.user.userId}
              aiChatEnabled={aiChatEnabled}
            />
            <Tabs tabs={mainTabs} defaultTabId="tasks" queryParam="tab" />
          </div>

          <Modal
            open={entryModal.open}
            onClose={() => setEntryModal({ open: false })}
            title={
              entryModal.open ? modalTitleByKind[entryModal.kind] : undefined
            }
            maxWidth="max-w-xl"
          >
            {entryModal.open && (
              <EntryForm
                mode="create"
                kind={entryModal.kind}
                onSuccess={handleEntrySuccess}
                onCancel={() => setEntryModal({ open: false })}
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
