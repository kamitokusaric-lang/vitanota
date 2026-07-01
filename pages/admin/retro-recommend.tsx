// system_admin: ふりかえり → AIリコメンドの改善ダッシュボード。
// 集計 (気づき提示率 / 転換率 / 見送り率 / 編集率 / 区分別) を表示し、
// prompt 改善用に匿名 CSV (reason/awareness/draft 込み) をエクスポートする。
//
// 踏み絵: 画面には集計のみ (個票・reason は出さない)。個別の reason は CSV エクスポート
// (system_admin 限定・匿名) でだけ見る。
import { useState, useEffect, useCallback } from 'react';
import type { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import type { VitanotaSession } from '@/shared/types/auth';
import type {
  RetroAnalyticsResponse,
  RetroCategoryBreakdown,
} from '@/features/system/retroAnalyticsTypes';

interface PageProps {
  session: VitanotaSession;
}

const LAUNCH_DATE = '2026-05-07';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return '—';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

const CATEGORY_LABEL: Record<RetroCategoryBreakdown['category'], string> = {
  soudan: '相談',
  kansha: '感謝',
  knowledge: 'ナレッジ',
  tweet: 'つぶやき',
  none: '(主提案なし)',
};

function MetricCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-gray-900">{value}</div>
      {caption && <div className="mt-1 text-[11px] text-gray-400">{caption}</div>}
    </div>
  );
}

export default function RetroRecommendPage({ session }: PageProps) {
  const [start, setStart] = useState<string>(LAUNCH_DATE);
  const [end, setEnd] = useState<string>(todayIsoDate());
  const [data, setData] = useState<RetroAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (s: string, e: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/system/retro-analytics?start=${s}&end=${e}`);
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(json.message ?? `HTTP ${res.status}`);
      }
      setData((await res.json()) as RetroAnalyticsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(start, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    void fetchData(start, end);
  };

  const exportHref = `/api/system/retro-recommend-export?from=${start}&to=${end}`;

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="system_admin">
        <AdminLayout session={session}>
          <div className="p-8">
            <div className="mx-auto max-w-7xl">
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">
                  ふりかえり AIリコメンド
                </h1>
                <p className="mt-2 text-sm text-gray-600">
                  マイノートのふりかえりから AI が返した公開リコメンドの集計。気づき提示率・転換率・見送り率・編集率を見て、プロンプト改善につなげる。
                </p>
                <p className="mt-1 text-[11px] text-gray-400">
                  すべて集計値のみ (個人・学校は特定しない)。個別の reason / 気づき / ドラフトは下の CSV エクスポート (匿名・PII マスク済) で確認する。
                </p>
              </div>

              <form onSubmit={onSubmit} className="mb-6 flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="start-date" className="block text-xs font-medium text-gray-700">
                    開始日
                  </label>
                  <input
                    id="start-date"
                    type="date"
                    value={start}
                    min={LAUNCH_DATE}
                    onChange={(e) => setStart(e.target.value)}
                    className="mt-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="end-date" className="block text-xs font-medium text-gray-700">
                    終了日
                  </label>
                  <input
                    id="end-date"
                    type="date"
                    value={end}
                    min={LAUNCH_DATE}
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
                <a
                  href={exportHref}
                  className="rounded border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  data-testid="retro-export-link"
                >
                  CSV エクスポート
                </a>
              </form>

              {loading && <LoadingSpinner />}
              {error && <ErrorMessage message={error} />}

              {data && !loading && (
                <div className="space-y-8">
                  {/* 主要指標 */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricCard
                      label="気づき提示率"
                      value={pct(data.surfaced, data.computedTotal)}
                      caption={`${data.surfaced} / ${data.computedTotal} 件が surface=true`}
                    />
                    <MetricCard
                      label="転換率 (出した)"
                      value={pct(data.published, data.surfaced)}
                      caption={`提示 ${data.surfaced} 件中 ${data.published} 件が公開`}
                    />
                    <MetricCard
                      label="見送り率"
                      value={pct(data.dismissed, data.surfaced)}
                      caption={`「今日はやめておく」 ${data.dismissed} 件`}
                    />
                    <MetricCard
                      label="編集率 (本文/区分)"
                      value={pct(data.bodyChanged + data.categoryChanged, data.published)}
                      caption={`本文 ${data.bodyChanged} / 区分変更 ${data.categoryChanged} (公開 ${data.published} 件中)`}
                    />
                  </div>

                  {/* 区分別 転換 */}
                  <div>
                    <h2 className="mb-3 text-sm font-bold text-gray-800">区分別の提示と転換</h2>
                    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                            <th className="px-4 py-2 font-medium">区分</th>
                            <th className="px-4 py-2 text-right font-medium">提示</th>
                            <th className="px-4 py-2 text-right font-medium">公開</th>
                            <th className="px-4 py-2 text-right font-medium">転換率</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.byCategory.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                                この期間のデータはありません。
                              </td>
                            </tr>
                          ) : (
                            data.byCategory.map((c) => (
                              <tr key={c.category} className="border-b border-gray-100 last:border-0">
                                <td className="px-4 py-2.5 text-gray-800">
                                  {CATEGORY_LABEL[c.category]}
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                                  {c.surfaced}
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                                  {c.published}
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900">
                                  {pct(c.published, c.surfaced)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </AdminLayout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
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
