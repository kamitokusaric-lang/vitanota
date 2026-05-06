// /dashboard - 統合ダッシュボード (大タブ切替: タスクボード / 日々ノート / 学校全体の温度)
// 大タブはシンプルな underline スタイル (Tabs default variant)
// 各タブ内の構造:
//   - タスクボード: デフォルト「自分」フィルタ、期限早い順、今日期限赤マーク
//   - 日々ノート: 投稿フォーム sticky + 子タブ「みんなの投稿 / わたしの投稿」
//   - 学校全体の温度 (school_admin のみ)
// 全タブ共通: ヘッダー直下に PhilosophyGreeting (哲学格言 + 投稿入口の 3 種別アイコン)。
// アイコンクリックで Modal が開き、EntryForm に kind pre-set 状態で投稿できる
import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { withAuthSSR } from '@/features/auth/lib/withAuthSSR';
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
    knowledge: 'ナレッジ共有',
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
          <div className="pb-6" data-testid="dashboard-page">
            {/* 哲学格言セクション (静かに読む UI、明朝 + 上下余白 + フェードイン)
                3 アイコンの投稿入口もこのセクションに内包 (格言 → author → アイコン) */}
            <PhilosophyGreeting onPick={handleKindPick} />
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

export const getServerSideProps = withAuthSSR({ requireRole: 'teacher' });
