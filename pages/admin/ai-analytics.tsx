// system_admin: AI 整理機能 (H1 検証 Phase B「見る」) の集計画面
// 全期間 aggregate のみ表示 (テナント横断、個人特定不可)
// データ源: ai_sessions.ai_output_json (jsonb 集計、school_admin 不可視)
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
import type { AiAnalyticsResponse } from '@/features/ai-chat/analyticsTypes';

interface AiAnalyticsPageProps {
  session: VitanotaSession;
}

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

function formatDateTime(at: string | null): string {
  if (!at) return '—';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const DISCARD_REASON_LABEL: Record<string, string> = {
  wrong_candidate: '候補が違う',
  too_detailed: '細かすぎる',
  too_rough: '雑すぎる',
  not_a_task: 'タスクではない',
  inconvenient: '使いにくい',
  privacy_concern: 'プライバシー懸念',
  other: 'その他',
  '(unspecified)': '(理由未選択)',
};

function reasonLabel(reason: string): string {
  return DISCARD_REASON_LABEL[reason] ?? reason;
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

function BarRow({
  label,
  count,
  max,
}: {
  label: string;
  count: number;
  max: number;
}) {
  const width = max === 0 ? 0 : Math.round((count / max) * 100);
  return (
    <div className="flex items-center gap-3 py-1.5 text-sm">
      <div className="w-32 shrink-0 text-gray-700">{label}</div>
      <div className="relative h-5 flex-1 overflow-hidden rounded bg-gray-100">
        <div
          className="absolute inset-y-0 left-0 bg-vn-accent/70"
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="w-12 shrink-0 text-right tabular-nums text-gray-600">
        {count}
      </div>
    </div>
  );
}

export default function AiAnalyticsPage({ session }: AiAnalyticsPageProps) {
  const [data, setData] = useState<AiAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/system/ai-analytics');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as AiAnalyticsResponse;
      setData(json);
    } catch (_e) {
      setLoadError('AI 改善データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const decisionTotal = data
    ? data.summary.confirmedCount + data.summary.discardedCount
    : 0;

  const discardMax = data
    ? data.discardReasons.reduce((m, r) => Math.max(m, r.count), 0)
    : 0;
  const editMax = data
    ? data.editReasons.reduce((m, r) => Math.max(m, r.count), 0)
    : 0;

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="system_admin">
        <AdminLayout session={session}>
          <div className="p-8">
            <div className="mx-auto max-w-6xl">
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">AI 改善</h1>
                <p className="mt-2 text-sm text-gray-600">
                  AI 整理機能 (Phase 1) の集計。全期間・テナント横断の aggregate
                  のみ表示。個別セッション・入力本文は表示しません。
                </p>
              </div>

              {loading && <LoadingSpinner />}
              {loadError && <ErrorMessage message={loadError} />}

              {!loading && !loadError && data && (
                <div className="space-y-8">
                  {/* 主指標 */}
                  <section>
                    <h2 className="mb-3 text-sm font-semibold text-gray-700">
                      主指標 (H1 検証)
                    </h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <MetricCard
                        label="タスク候補作成確定率"
                        value={formatPercent(
                          data.summary.confirmedCount,
                          decisionTotal,
                        )}
                        caption={`確定 ${data.summary.confirmedCount} / 決定 ${decisionTotal}`}
                      />
                      <MetricCard
                        label="整理されたスコア平均"
                        value={formatScore(data.summary.organizeScoreAvg)}
                        caption={`アンケート回答数 ${data.summary.surveyCount} / 5 点満点`}
                      />
                      <MetricCard
                        label="破棄率"
                        value={formatPercent(
                          data.summary.discardedCount,
                          decisionTotal,
                        )}
                        caption={`破棄 ${data.summary.discardedCount} / 決定 ${decisionTotal}`}
                      />
                    </div>
                    <p className="mt-2 text-[11px] text-gray-400">
                      総セッション数 {data.summary.totalSessions} (うち draft{' '}
                      {data.summary.draftCount})
                    </p>
                  </section>

                  {/* 副指標 */}
                  <section>
                    <h2 className="mb-3 text-sm font-semibold text-gray-700">
                      副指標
                    </h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <MetricCard
                        label="1 入力あたり候補生成数"
                        value={formatScore(
                          data.subMetrics.candidatesPerInputAvg,
                        )}
                        caption={`対象 ${data.subMetrics.candidatesPerInputCount} セッション`}
                      />
                      <MetricCard
                        label="確定までの時間 (平均)"
                        value={formatDuration(
                          data.subMetrics.timeToConfirmSecondsAvg,
                        )}
                        caption={`対象 ${data.subMetrics.timeToConfirmCount} セッション`}
                      />
                      <MetricCard
                        label="再利用率 (2 回以上)"
                        value={formatPercent(
                          data.subMetrics.reusedUsers,
                          data.subMetrics.uniqueUsers,
                        )}
                        caption={`${data.subMetrics.reusedUsers} / ${data.subMetrics.uniqueUsers} ユーザー`}
                      />
                    </div>
                  </section>

                  {/* 修正率 */}
                  <section>
                    <h2 className="mb-3 text-sm font-semibold text-gray-700">
                      AI 提案の修正率 (確定タスク候補 {data.editRate.candidateCount} 件)
                    </h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <MetricCard
                        label="タイトル修正率"
                        value={formatPercent(
                          data.editRate.titleChanged,
                          data.editRate.candidateCount,
                        )}
                        caption={`修正 ${data.editRate.titleChanged} 件`}
                      />
                      <MetricCard
                        label="カテゴリ修正率"
                        value={formatPercent(
                          data.editRate.categoryChanged,
                          data.editRate.candidateCount,
                        )}
                        caption={`修正 ${data.editRate.categoryChanged} 件`}
                      />
                      <MetricCard
                        label="期限修正率"
                        value={formatPercent(
                          data.editRate.dueDateChanged,
                          data.editRate.candidateCount,
                        )}
                        caption={`修正 ${data.editRate.dueDateChanged} 件`}
                      />
                    </div>
                  </section>

                  {/* ガードレール */}
                  <section>
                    <h2 className="mb-3 text-sm font-semibold text-gray-700">
                      ガードレール
                    </h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <MetricCard
                        label="生成後破棄率 (危険域: 70%以上)"
                        value={formatPercent(
                          data.summary.discardedCount,
                          decisionTotal,
                        )}
                        caption={`破棄 ${data.summary.discardedCount} / 決定 ${decisionTotal}`}
                      />
                      <MetricCard
                        label="入力負担スコア平均"
                        value={formatScore(
                          data.guardrails.inputBurdenScoreAvg,
                        )}
                        caption={`回答数 ${data.guardrails.inputBurdenScoreCount} / 5 点満点 (低いほど負担小)`}
                      />
                      <MetricCard
                        label="監視不安での破棄"
                        value={
                          data.guardrails.privacyConcernDiscardRate == null
                            ? '—'
                            : `${(data.guardrails.privacyConcernDiscardRate * 100).toFixed(1)}%`
                        }
                        caption={`privacy_concern ${data.guardrails.privacyConcernDiscardCount} 件 / 全破棄`}
                      />
                    </div>
                  </section>

                  {/* prompt_version 別 */}
                  <section>
                    <h2 className="mb-3 text-sm font-semibold text-gray-700">
                      プロンプト版別の成果
                    </h2>
                    {data.promptVersions.length === 0 ? (
                      <p className="text-sm text-gray-500">データがありません</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50 text-left">
                            <tr>
                              <th className="px-4 py-2 font-medium text-gray-600">
                                プロンプト版
                              </th>
                              <th className="px-4 py-2 text-right font-medium text-gray-600">
                                総数
                              </th>
                              <th className="px-4 py-2 text-right font-medium text-gray-600">
                                確定
                              </th>
                              <th className="px-4 py-2 text-right font-medium text-gray-600">
                                破棄
                              </th>
                              <th className="px-4 py-2 text-right font-medium text-gray-600">
                                確定率
                              </th>
                              <th className="px-4 py-2 text-right font-medium text-gray-600">
                                整理スコア平均
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {data.promptVersions.map((v) => {
                              const dt = v.confirmed + v.discarded;
                              return (
                                <tr key={v.promptVersion}>
                                  <td className="px-4 py-2 font-mono text-xs text-gray-700">
                                    {v.promptVersion}
                                  </td>
                                  <td className="px-4 py-2 text-right tabular-nums">
                                    {v.total}
                                  </td>
                                  <td className="px-4 py-2 text-right tabular-nums">
                                    {v.confirmed}
                                  </td>
                                  <td className="px-4 py-2 text-right tabular-nums">
                                    {v.discarded}
                                  </td>
                                  <td className="px-4 py-2 text-right tabular-nums">
                                    {formatPercent(v.confirmed, dt)}
                                  </td>
                                  <td className="px-4 py-2 text-right tabular-nums">
                                    {formatScore(v.organizeScoreAvg)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  {/* カテゴリ別修正率 */}
                  <section>
                    <h2 className="mb-3 text-sm font-semibold text-gray-700">
                      カテゴリ別 修正率
                    </h2>
                    {data.categoryEdit.length === 0 ? (
                      <p className="text-sm text-gray-500">データがありません</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50 text-left">
                            <tr>
                              <th className="px-4 py-2 font-medium text-gray-600">
                                教員が選択したカテゴリ
                              </th>
                              <th className="px-4 py-2 text-right font-medium text-gray-600">
                                候補数
                              </th>
                              <th className="px-4 py-2 text-right font-medium text-gray-600">
                                AI 提案から変更
                              </th>
                              <th className="px-4 py-2 text-right font-medium text-gray-600">
                                修正率
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {data.categoryEdit.map((c) => (
                              <tr key={c.parentName}>
                                <td className="px-4 py-2 text-gray-700">
                                  {c.parentName}
                                </td>
                                <td className="px-4 py-2 text-right tabular-nums">
                                  {c.candidateCount}
                                </td>
                                <td className="px-4 py-2 text-right tabular-nums">
                                  {c.categoryChanged}
                                </td>
                                <td className="px-4 py-2 text-right tabular-nums">
                                  {formatPercent(
                                    c.categoryChanged,
                                    c.candidateCount,
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  {/* 破棄理由 / 編集理由 */}
                  <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="rounded-lg border border-gray-200 bg-white p-5">
                      <h2 className="mb-3 text-sm font-semibold text-gray-700">
                        破棄理由ランキング
                      </h2>
                      {data.discardReasons.length === 0 ? (
                        <p className="text-sm text-gray-500">
                          破棄されたセッションはまだありません
                        </p>
                      ) : (
                        <div>
                          {data.discardReasons.map((r) => (
                            <BarRow
                              key={r.reason}
                              label={reasonLabel(r.reason)}
                              count={r.count}
                              max={discardMax}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white p-5">
                      <h2 className="mb-3 text-sm font-semibold text-gray-700">
                        編集理由ランキング
                      </h2>
                      {data.editReasons.length === 0 ? (
                        <p className="text-sm text-gray-500">
                          編集理由の回答はまだありません
                        </p>
                      ) : (
                        <div>
                          {data.editReasons.map((r) => (
                            <BarRow
                              key={r.reason}
                              label={reasonLabel(r.reason)}
                              count={r.count}
                              max={editMax}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  {/* 自由コメント (定性ログ) */}
                  <section>
                    <h2 className="mb-3 text-sm font-semibold text-gray-700">
                      自由コメント (定性ログ)
                    </h2>
                    <p className="mb-3 text-xs text-gray-500">
                      教員が自由記述で入力したテキスト。PII が含まれる可能性があるため
                      system_admin のみ閲覧。誰が書いたかの紐付けは表示しません (匿名集計)。
                    </p>
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      <div className="rounded-lg border border-gray-200 bg-white p-5">
                        <h3 className="mb-3 text-xs font-semibold text-gray-600">
                          破棄時のコメント (新しい順 50 件)
                        </h3>
                        {data.freeComments.discard.length === 0 ? (
                          <p className="text-sm text-gray-500">コメントはまだありません</p>
                        ) : (
                          <ul className="space-y-3">
                            {data.freeComments.discard.map((c, i) => (
                              <li key={i} className="border-l-2 border-gray-200 pl-3">
                                <div className="text-[11px] text-gray-400">
                                  {formatDateTime(c.at)}
                                  {c.reason && ` · ${reasonLabel(c.reason)}`}
                                </div>
                                <div className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
                                  {c.text}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="rounded-lg border border-gray-200 bg-white p-5">
                        <h3 className="mb-3 text-xs font-semibold text-gray-600">
                          編集時のコメント (新しい順 50 件)
                        </h3>
                        {data.freeComments.edit.length === 0 ? (
                          <p className="text-sm text-gray-500">コメントはまだありません</p>
                        ) : (
                          <ul className="space-y-3">
                            {data.freeComments.edit.map((c, i) => (
                              <li key={i} className="border-l-2 border-gray-200 pl-3">
                                <div className="text-[11px] text-gray-400">
                                  {formatDateTime(c.at)}
                                  {c.reason && ` · ${reasonLabel(c.reason)}`}
                                </div>
                                <div className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
                                  {c.text}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>
        </AdminLayout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps: GetServerSideProps<AiAnalyticsPageProps> = async (
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
      session: {
        ...session,
        user: { ...session.user },
      },
    },
  };
};
