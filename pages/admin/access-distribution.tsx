// system_admin: アクセス分布ダッシュボード
// AppRunner HTTP リクエスト (PV) + sessions テーブル (UU) を時間帯別に可視化
// 2026-05-15 朝の PAM failed 障害調査で「教員アクセス集中時に発火」が必要条件と判明、
// incident と利用パターンの照合に使う運用基盤
import { useState, useEffect, useCallback } from 'react';
import type { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { SummaryCards } from '@/features/access-distribution/components/SummaryCards';
import { HourlyBarChart } from '@/features/access-distribution/components/HourlyBarChart';
import { HeatmapTable } from '@/features/access-distribution/components/HeatmapTable';
import type { VitanotaSession } from '@/shared/types/auth';
import type { AccessDistributionResponse } from '@/features/access-distribution/types';

interface PageProps {
  session: VitanotaSession;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIsoDate(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export default function AccessDistributionPage({ session }: PageProps) {
  // default: 過去 7 日 (今日含む)
  const [start, setStart] = useState<string>(daysAgoIsoDate(6));
  const [end, setEnd] = useState<string>(todayIsoDate());
  const [data, setData] = useState<AccessDistributionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (s: string, e: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/system/access-distribution?start=${s}&end=${e}`,
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(json.message ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as AccessDistributionResponse;
      setData(json);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'データの取得に失敗しました',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // 初回のみ自動取得 (期間ピッカー変更時は明示的に「集計」ボタンを押す)
  useEffect(() => {
    void fetchData(start, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    void fetchData(start, end);
  };

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="system_admin">
        <AdminLayout session={session}>
          <div className="p-8">
            <div className="mx-auto max-w-7xl">
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">アクセス分布</h1>
                <p className="mt-2 text-sm text-gray-600">
                  教員アクセスの時間帯分布を集計。PAM failed 等の incident と利用パターンの照合に使う。
                </p>
                <p className="mt-1 text-[11px] text-gray-400">
                  1 時間集計 / JST / CloudWatch retention 15 ヶ月 / 直近 1h は集計中 (3〜5 分遅延)
                </p>
              </div>

              <form
                onSubmit={onSubmit}
                className="mb-6 flex flex-wrap items-end gap-3"
              >
                <div>
                  <label
                    htmlFor="start-date"
                    className="block text-xs font-medium text-gray-700"
                  >
                    開始日
                  </label>
                  <input
                    id="start-date"
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="mt-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="end-date"
                    className="block text-xs font-medium text-gray-700"
                  >
                    終了日
                  </label>
                  <input
                    id="end-date"
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className="mt-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded bg-vn-accent px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  集計
                </button>
                <span className="ml-2 text-[11px] text-gray-400">
                  期間 1〜60 日
                </span>
              </form>

              {loading && <LoadingSpinner />}
              {error && <ErrorMessage message={error} />}

              {!loading && !error && data && (
                <div className="space-y-6">
                  <SummaryCards summary={data.summary} />
                  <HourlyBarChart hourly={data.hourly} />
                  <HeatmapTable heatmap={data.heatmap} />
                  <p className="text-[11px] text-gray-400">
                    生成: {new Date(data.meta.generatedAt).toLocaleString('ja-JP')} / {data.meta.periodDays} 日間
                  </p>
                </div>
              )}
            </div>
          </div>
        </AdminLayout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (
  ctx,
) => {
  const authOptions = await getAuthOptions();
  const session = (await getServerSession(
    ctx.req,
    ctx.res,
    authOptions,
  )) as VitanotaSession | null;
  if (!session) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }
  return {
    props: {
      session: { ...session, user: { ...session.user } },
    },
  };
};
