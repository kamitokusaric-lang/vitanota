// /dashboard/teacher - 教員ダッシュボード（US-T-030）
// Unit-03: 感情傾向の時系列グラフ表示
import { useState } from 'react';
import { withAuthSSR } from '@/features/auth/lib/withAuthSSR';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import { PeriodSelector } from '@/features/teacher-dashboard/components/PeriodSelector';
import { EmotionTrendChart } from '@/features/teacher-dashboard/components/EmotionTrendChart';
import { EmptyStateGuide } from '@/features/teacher-dashboard/components/EmptyStateGuide';
import { useEmotionTrend } from '@/features/teacher-dashboard/hooks/useEmotionTrend';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import type { VitanotaSession } from '@/shared/types/auth';

const PERIOD_DAYS = { week: 7, month: 30, quarter: 90 } as const;
const MIN_ENTRIES = 3;

interface TeacherDashboardPageProps {
  session: VitanotaSession;
}

export default function TeacherDashboardPage({
  session,
}: TeacherDashboardPageProps) {
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('week');
  const { data, error, isLoading } = useEmotionTrend(period);

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="teacher">
        <Layout session={session}>
          <div className="py-6" data-testid="teacher-dashboard-page">
            <header className="mb-6">
              <h1 className="text-xl font-bold text-gray-900">感情傾向</h1>
              <p className="mt-1 text-sm text-gray-500">
                感情タグの推移をグラフで確認できます
              </p>
            </header>

            <div className="mb-4">
              <PeriodSelector value={period} onChange={setPeriod} />
            </div>

            {error && (
              <ErrorMessage message="感情傾向データの取得に失敗しました" />
            )}

            {isLoading && (
              <div className="flex h-64 items-center justify-center">
                <p className="text-sm text-gray-400">読み込み中...</p>
              </div>
            )}

            {!isLoading && !error && data && (
              <>
                {data.totalEntries < MIN_ENTRIES ? (
                  <EmptyStateGuide
                    currentCount={data.totalEntries}
                    minRequired={MIN_ENTRIES}
                  />
                ) : (
                  <EmotionTrendChart
                    data={data.data}
                    periodDays={PERIOD_DAYS[period]}
                  />
                )}
              </>
            )}
          </div>
        </Layout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps = withAuthSSR();
