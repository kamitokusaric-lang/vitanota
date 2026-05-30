// system_admin: アクセス分布ダッシュボード
// 全メトリクス (UU / AI 整理 / 日々ノート / タスク / カレンダー) を date×hour の
// バブルチャートで可視化 (x=日付 / y=時間帯 / 大きさ=件数 / 色=系列)。
// 2026-05-15 朝の PAM failed 障害調査で「教員アクセス集中時に発火」が必要条件と判明、
// incident と利用パターンの照合に使う運用基盤。
// 2026-05-30 (chimo): ヒートマップ + 折れ線を廃止しバブルに統一。
import { useState, useEffect, useCallback } from 'react';
import type { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import {
  MetricBubbleChart,
  type BubbleSeries,
} from '@/features/access-distribution/components/MetricBubbleChart';
import type { VitanotaSession } from '@/shared/types/auth';
import type {
  AccessDistributionResponse,
  CalendarEventTypeKey,
} from '@/features/access-distribution/types';
import type { AiAnalyticsResponse } from '@/features/ai-chat/analyticsTypes';

// カレンダーの event 種別ごとの色とラベル (バブルの色分け)
const CALENDAR_SERIES: Array<{
  key: CalendarEventTypeKey;
  label: string;
  color: string;
}> = [
  { key: 'view_switched', label: '表示切替', color: '#6366f1' },
  { key: 'day_detail_opened', label: '日付詳細', color: '#22c55e' },
  { key: 'task_created_from_plus', label: '＋作成', color: '#f59e0b' },
  { key: 'task_moved', label: '日付変更(DnD)', color: '#06b6d4' },
  { key: 'task_pushed_to_next_week', label: '来週に渡す', color: '#ec4899' },
];

interface PageProps {
  session: VitanotaSession;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── AI 改善指標 (アクセス分布ページ末尾、 chimo 2026-05-30 統合) ──
function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) return '—';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatScore(value: number | null): string {
  if (value == null) return '—';
  return value.toFixed(2);
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${Math.round(seconds)} 秒`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} 分`;
  return `${(seconds / 3600).toFixed(1)} 時間`;
}

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

// 説明会日 (= 教員導入開始日)。 これより前は MVP 内部テスト期間でノイズが多いため除外。
const LAUNCH_DATE = '2026-05-07';

export default function AccessDistributionPage({ session }: PageProps) {
  // default: 説明会日 (2026-05-07) 〜 今日。 最大 90 日 (3 ヶ月) まで延長可
  const [start, setStart] = useState<string>(LAUNCH_DATE);
  const [end, setEnd] = useState<string>(todayIsoDate());
  const [data, setData] = useState<AccessDistributionResponse | null>(null);
  const [aiData, setAiData] = useState<AiAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (s: string, e: string) => {
    setLoading(true);
    setError(null);
    try {
      // アクセス分布 (必須) と AI 改善指標 (同期間) を並列取得。
      const [distRes, aiRes] = await Promise.all([
        fetch(`/api/system/access-distribution?start=${s}&end=${e}`),
        fetch(`/api/system/ai-analytics?start=${s}&end=${e}`),
      ]);
      if (!distRes.ok) {
        const json = (await distRes.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(json.message ?? `HTTP ${distRes.status}`);
      }
      setData((await distRes.json()) as AccessDistributionResponse);
      // AI 指標は best-effort: 失敗してもアクセス分布の表示は止めない。
      setAiData(aiRes.ok ? ((await aiRes.json()) as AiAnalyticsResponse) : null);
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
                  教員のログイン時刻 (UU) と AI 機能 (H1 雑投げ)、 日々ノート登録、 タスク操作、 カレンダー操作をバブルで可視化。 末尾に AI 整理 (H1) の改善指標 (確定率 / 修正率 / ガードレール) を掲載。 すべて上の期間で絞り込み。
                </p>
                <p className="mt-1 text-[11px] text-gray-400">
                  1 時間集計 / JST / UU は sessions.created_at distinct / AI 利用は ai_sessions 件数 / 日々ノートは journal_entries 件数 (括弧内は非公開) / タスクは tasks.updated_at 件数 (括弧内は完了) / カレンダーは calendar_events 全 interaction 件数 (COUNT(*), 全 event 種別)
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
                    min={LAUNCH_DATE}
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
                <span className="ml-2 text-[11px] text-gray-400">
                  期間 1〜90 日 / 開始日は {LAUNCH_DATE} 以降
                </span>
              </form>

              {loading && <LoadingSpinner />}
              {error && <ErrorMessage message={error} />}

              {!loading && !error && data && (
                <div className="space-y-8">
                  <MetricBubbleChart
                    title="UU (ログイン教員数)"
                    unit="人"
                    series={[
                      {
                        key: 'uu',
                        label: 'UU',
                        color: '#6366f1',
                        points: data.uu,
                      },
                    ]}
                    caption={`期間: ${data.meta.start} 〜 ${data.meta.end} / sessions.created_at の JST date×hour 別 distinct user_id`}
                  />
                  <MetricBubbleChart
                    title="日々ノート登録数"
                    subLabel="非公開"
                    series={[
                      {
                        key: 'journal',
                        label: '日々ノート',
                        color: '#0ea5e9',
                        points: data.journal,
                      },
                    ]}
                    caption={`期間: ${data.meta.start} 〜 ${data.meta.end} / journal_entries 件数 (ツールチップにうち非公開)`}
                  />
                  <MetricBubbleChart
                    title="タスク操作数"
                    subLabel="完了"
                    series={[
                      {
                        key: 'task',
                        label: 'タスク',
                        color: '#10b981',
                        points: data.task,
                      },
                    ]}
                    caption={`期間: ${data.meta.start} 〜 ${data.meta.end} / tasks.updated_at 件数 (ツールチップにうち完了)`}
                  />
                  <MetricBubbleChart
                    title="カレンダー操作数"
                    showLegend
                    series={CALENDAR_SERIES.map<BubbleSeries>((s) => ({
                      key: s.key,
                      label: s.label,
                      color: s.color,
                      points: data.calendar
                        .filter((p) => p.eventType === s.key)
                        .map((p) => ({
                          date: p.date,
                          hour: p.hour,
                          count: p.count,
                        })),
                    }))}
                    caption={`期間: ${data.meta.start} 〜 ${data.meta.end} / calendar_events を event 種別で色分け (x=日付 y=時間帯 大きさ=件数)`}
                  />

                  <MetricBubbleChart
                    title="AI 整理 (H1) 利用数"
                    series={[
                      {
                        key: 'quickCapture',
                        label: 'AI 整理',
                        color: '#8b5cf6',
                        points: data.quickCapture,
                      },
                    ]}
                    caption={`期間: ${data.meta.start} 〜 ${data.meta.end} / ai_sessions WHERE type='quick_capture' の件数`}
                  />

                  {/* AI 整理 (H1) 改善指標 — 上の期間ピッカーで絞り込み (chimo 2026-05-30 統合) */}
                  {aiData && (() => {
                    const decisionTotal =
                      aiData.summary.confirmedCount +
                      aiData.summary.discardedCount;
                    return (
                      <>
                        <div className="border-t border-gray-200 pt-6">
                          <h2 className="text-lg font-bold text-gray-900">
                            AI 整理 (H1) 改善指標
                          </h2>
                          <p className="mt-1 text-[11px] text-gray-400">
                            期間: {data.meta.start} 〜 {data.meta.end} / ai_sessions
                            の aggregate (個別セッションはデータエクスポートを参照)
                          </p>
                        </div>

                        {/* 主指標 */}
                        <section>
                          <h3 className="mb-3 text-sm font-semibold text-gray-700">
                            主指標 (H1 検証)
                          </h3>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <MetricCard
                              label="タスク候補作成確定率"
                              value={formatPercent(
                                aiData.summary.confirmedCount,
                                decisionTotal,
                              )}
                              caption={`確定 ${aiData.summary.confirmedCount} / 決定 ${decisionTotal}`}
                            />
                            <MetricCard
                              label="破棄率"
                              value={formatPercent(
                                aiData.summary.discardedCount,
                                decisionTotal,
                              )}
                              caption={`破棄 ${aiData.summary.discardedCount} / 決定 ${decisionTotal}`}
                            />
                          </div>
                          <p className="mt-2 text-[11px] text-gray-400">
                            総セッション数 {aiData.summary.totalSessions} (うち draft{' '}
                            {aiData.summary.draftCount})
                          </p>
                        </section>

                        {/* 副指標 */}
                        <section>
                          <h3 className="mb-3 text-sm font-semibold text-gray-700">
                            副指標
                          </h3>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <MetricCard
                              label="1 入力あたり候補生成数"
                              value={formatScore(
                                aiData.subMetrics.candidatesPerInputAvg,
                              )}
                              caption={`対象 ${aiData.subMetrics.candidatesPerInputCount} セッション`}
                            />
                            <MetricCard
                              label="確定までの時間 (平均)"
                              value={formatDuration(
                                aiData.subMetrics.timeToConfirmSecondsAvg,
                              )}
                              caption={`対象 ${aiData.subMetrics.timeToConfirmCount} セッション`}
                            />
                            <MetricCard
                              label="再利用率 (2 回以上)"
                              value={formatPercent(
                                aiData.subMetrics.reusedUsers,
                                aiData.subMetrics.uniqueUsers,
                              )}
                              caption={`${aiData.subMetrics.reusedUsers} / ${aiData.subMetrics.uniqueUsers} ユーザー`}
                            />
                          </div>
                        </section>

                        {/* 修正率 */}
                        <section>
                          <h3 className="mb-3 text-sm font-semibold text-gray-700">
                            AI 提案の修正率 (確定タスク候補 {aiData.editRate.candidateCount} 件)
                          </h3>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <MetricCard
                              label="タイトル修正率"
                              value={formatPercent(
                                aiData.editRate.titleChanged,
                                aiData.editRate.candidateCount,
                              )}
                              caption={`修正 ${aiData.editRate.titleChanged} 件`}
                            />
                            <MetricCard
                              label="カテゴリ修正率"
                              value={formatPercent(
                                aiData.editRate.categoryChanged,
                                aiData.editRate.candidateCount,
                              )}
                              caption={`修正 ${aiData.editRate.categoryChanged} 件`}
                            />
                            <MetricCard
                              label="期限修正率"
                              value={formatPercent(
                                aiData.editRate.dueDateChanged,
                                aiData.editRate.candidateCount,
                              )}
                              caption={`修正 ${aiData.editRate.dueDateChanged} 件`}
                            />
                          </div>
                        </section>

                        {/* ガードレール */}
                        <section>
                          <h3 className="mb-3 text-sm font-semibold text-gray-700">
                            ガードレール
                          </h3>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <MetricCard
                              label="生成後破棄率 (危険域: 70%以上)"
                              value={formatPercent(
                                aiData.summary.discardedCount,
                                decisionTotal,
                              )}
                              caption={`破棄 ${aiData.summary.discardedCount} / 決定 ${decisionTotal}`}
                            />
                          </div>
                        </section>
                      </>
                    );
                  })()}

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
