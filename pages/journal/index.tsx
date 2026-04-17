// /journal - 共有タイムラインページ（US-T-014）
// Unit-03: EmotionSummaryCard を上部に追加
import Link from 'next/link';
import { withAuthSSR } from '@/features/auth/lib/withAuthSSR';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import { Button } from '@/shared/components/Button';
import { TimelineList } from '@/features/journal/components/TimelineList';
import { EmotionSummaryCard } from '@/features/teacher-dashboard/components/EmotionSummaryCard';
import { useEmotionTrend } from '@/features/teacher-dashboard/hooks/useEmotionTrend';
import type { VitanotaSession } from '@/shared/types/auth';

interface JournalTimelinePageProps {
  session: VitanotaSession;
}

export default function JournalTimelinePage({
  session,
}: JournalTimelinePageProps) {
  const { data: emotionData, isLoading: emotionLoading } = useEmotionTrend('week');

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="teacher">
        <Layout session={session}>
          <div className="py-6">
            {/* Unit-03: 感情サマリーカード */}
            <div className="mb-4">
              <EmotionSummaryCard data={emotionData} isLoading={emotionLoading} />
            </div>

            <header className="mb-6 flex items-center justify-between">
              <h1
                className="text-xl font-bold text-gray-900"
                data-testid="journal-timeline-heading"
              >
                共有タイムライン
              </h1>
              <div className="flex gap-2">
                <Link href="/journal/mine" data-testid="nav-to-mine-link">
                  <Button variant="secondary" className="text-xs">
                    マイ記録
                  </Button>
                </Link>
                <Link href="/journal/new" data-testid="nav-to-new-link">
                  <Button className="text-xs">新規投稿</Button>
                </Link>
              </div>
            </header>

            <TimelineList />
          </div>
        </Layout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps = withAuthSSR({ requireRole: 'teacher' });
