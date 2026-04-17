// /dashboard/admin/teacher/[id] — 特定教員の感情傾向 + 公開タイムライン（US-A-011）
import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { withAuthSSR } from '@/features/auth/lib/withAuthSSR';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { PeriodSelector } from '@/features/teacher-dashboard/components/PeriodSelector';
import { EmotionTrendChart } from '@/features/teacher-dashboard/components/EmotionTrendChart';
import { EmptyStateGuide } from '@/features/teacher-dashboard/components/EmptyStateGuide';
import { EntryCard } from '@/features/journal/components/EntryCard';
import { useTeacherEmotionTrend } from '@/features/admin-dashboard/hooks/useTeacherEmotionTrend';
import { useTeacherEntries } from '@/features/admin-dashboard/hooks/useTeacherEntries';
import type { VitanotaSession } from '@/shared/types/auth';

const PERIOD_DAYS = { week: 7, month: 30, quarter: 90 } as const;
const MIN_ENTRIES = 3;

interface TeacherDetailPageProps {
  session: VitanotaSession;
}

export default function TeacherDetailPage({ session }: TeacherDetailPageProps) {
  const router = useRouter();
  const teacherId = router.query.id as string;
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('week');
  const { data, error, isLoading } = useTeacherEmotionTrend(teacherId, period);
  const { entries, error: entriesError, isLoading: entriesLoading } = useTeacherEntries(teacherId);

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="school_admin">
        <Layout session={session}>
          <div className="py-6" data-testid="admin-teacher-detail-page">
            <div className="mb-4">
              <Link
                href="/dashboard/admin"
                className="text-sm text-blue-600 hover:underline"
                data-testid="back-to-admin-link"
              >
                ← 一覧に戻る
              </Link>
            </div>

            <header className="mb-6">
              <h1 className="text-xl font-bold text-gray-900">教員の感情傾向</h1>
              <p className="mt-1 text-xs text-gray-400">
                感情グラフには非公開を含む全記録の感情タグが反映されますが、投稿内容は共有投稿のみ表示されます
              </p>
            </header>

            <div className="mb-4">
              <PeriodSelector value={period} onChange={setPeriod} />
            </div>

            {error && <ErrorMessage message="感情傾向データの取得に失敗しました" />}

            {isLoading && (
              <div className="flex h-64 items-center justify-center">
                <p className="text-sm text-gray-400">読み込み中...</p>
              </div>
            )}

            {!isLoading && !error && data && (
              <>
                {data.totalEntries < MIN_ENTRIES ? (
                  <EmptyStateGuide currentCount={data.totalEntries} minRequired={MIN_ENTRIES} />
                ) : (
                  <EmotionTrendChart data={data.data} periodDays={PERIOD_DAYS[period]} />
                )}
              </>
            )}

            {/* 公開タイムライン */}
            <section className="mt-8">
              <h2 className="mb-3 text-lg font-semibold text-gray-800">
                共有投稿
              </h2>
              <p className="mb-3 text-xs text-gray-400">
                この教員が共有した投稿のみ表示しています
              </p>

              {entriesError && <ErrorMessage message="投稿の取得に失敗しました" />}

              {entriesLoading && (
                <div className="py-6 text-center text-sm text-gray-400">読み込み中...</div>
              )}

              {!entriesLoading && !entriesError && entries && (
                <>
                  {entries.length === 0 ? (
                    <div className="py-6 text-center text-sm text-gray-500">
                      共有された投稿はありません
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {entries.map((entry) => (
                        <EntryCard
                          key={entry.id}
                          entry={{
                            id: entry.id,
                            userId: teacherId,
                            content: entry.content,
                            createdAt: entry.createdAt,
                            tags: entry.tags,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </Layout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps = withAuthSSR({ requireRole: 'school_admin' });
