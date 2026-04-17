// /dashboard/admin — 管理者ダッシュボード（US-A-010 + 学校全体感情傾向）
import { useState } from 'react';
import { useRouter } from 'next/router';
import { withAuthSSR } from '@/features/auth/lib/withAuthSSR';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { TeacherStatusGrid } from '@/features/admin-dashboard/components/TeacherStatusGrid';
import { AlertBanner } from '@/features/admin-dashboard/components/AlertBanner';
import { PeriodSelector } from '@/features/teacher-dashboard/components/PeriodSelector';
import { EmotionTrendChart } from '@/features/teacher-dashboard/components/EmotionTrendChart';
import { EmptyStateGuide } from '@/features/teacher-dashboard/components/EmptyStateGuide';
import { useTeacherStatuses } from '@/features/admin-dashboard/hooks/useTeacherStatuses';
import { useAdminAlerts } from '@/features/admin-dashboard/hooks/useAdminAlerts';
import { useSchoolEmotionTrend } from '@/features/admin-dashboard/hooks/useSchoolEmotionTrend';
import type { VitanotaSession } from '@/shared/types/auth';

const PERIOD_DAYS = { week: 7, month: 30, quarter: 90 } as const;
const MIN_ENTRIES = 3;

interface AdminDashboardProps {
  session: VitanotaSession;
}

export default function AdminDashboard({ session }: AdminDashboardProps) {
  const router = useRouter();
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('week');
  const { teachers, error: teachersError, isLoading: teachersLoading } = useTeacherStatuses();
  const { alerts, error: alertsError } = useAdminAlerts();
  const { data: schoolTrend, error: trendError, isLoading: trendLoading } = useSchoolEmotionTrend(period);

  const openAlertCount = alerts?.length ?? 0;

  return (
    <TenantGuard session={session}>
      <RoleGuard
        session={session}
        requiredRole="school_admin"
        fallback={
          <div className="py-20 text-center text-gray-500">アクセス権限がありません</div>
        }
      >
        <Layout session={session}>
          <div className="py-6" data-testid="admin-dashboard-page">
            <header className="mb-6">
              <h1 className="text-xl font-bold text-gray-900">管理者ダッシュボード</h1>
              <p className="mt-1 text-sm text-gray-500">
                テナント内の教員のコンディションを確認できます
              </p>
            </header>

            <AlertBanner openCount={openAlertCount} />

            {/* 学校全体の感情傾向グラフ */}
            <section className="mb-8">
              <h2 className="mb-3 text-lg font-semibold text-gray-800">学校全体の感情傾向</h2>
              <div className="mb-3">
                <PeriodSelector value={period} onChange={setPeriod} />
              </div>
              {trendError && <ErrorMessage message="感情傾向データの取得に失敗しました" />}
              {trendLoading && (
                <div className="flex h-48 items-center justify-center text-sm text-gray-400">読み込み中...</div>
              )}
              {!trendLoading && !trendError && schoolTrend && (
                <>
                  {schoolTrend.totalEntries < MIN_ENTRIES ? (
                    <EmptyStateGuide currentCount={schoolTrend.totalEntries} minRequired={MIN_ENTRIES} />
                  ) : (
                    <EmotionTrendChart data={schoolTrend.data} periodDays={PERIOD_DAYS[period]} />
                  )}
                </>
              )}
            </section>

            {/* 教員ステータス一覧 */}
            <section>
              <h2 className="mb-3 text-lg font-semibold text-gray-800">教員ステータス</h2>

              {teachersError && <ErrorMessage message="教員データの取得に失敗しました" />}
              {alertsError && <ErrorMessage message="アラートデータの取得に失敗しました" />}

              {teachersLoading && (
                <div className="py-10 text-center text-sm text-gray-400">読み込み中...</div>
              )}

              {!teachersLoading && !teachersError && teachers && (
                <TeacherStatusGrid
                  teachers={teachers}
                  onTeacherClick={(userId) => router.push(`/dashboard/admin/teacher/${userId}`)}
                />
              )}
            </section>
          </div>
        </Layout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps = withAuthSSR({ requireRole: 'school_admin' });
