// system_admin: AI 整理機能 (H1 検証 Phase B「見る」) の集計画面
// 全期間 aggregate のみ表示 (テナント横断、個人特定不可)
// データ源: ai_sessions.ai_output_json (jsonb 集計、school_admin 不可視)
import { useState, useEffect, useCallback } from 'react';
import type { GetServerSideProps } from 'next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import type { VitanotaSession } from '@/shared/types/auth';
import type {
  AiAnalyticsResponse,
  SessionDetail,
} from '@/features/ai-chat/analyticsTypes';

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

function StatusBadge({ status }: { status: SessionDetail['status'] }) {
  const map: Record<SessionDetail['status'], { label: string; cls: string }> = {
    draft: { label: 'draft', cls: 'bg-gray-100 text-gray-600' },
    confirmed: { label: 'confirmed', cls: 'bg-emerald-100 text-emerald-700' },
    discarded: { label: 'discarded', cls: 'bg-orange-100 text-orange-700' },
  };
  const { label, cls } = map[status];
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function DiffPair({
  label,
  before,
  after,
  changed,
}: {
  label: string;
  before: string | null;
  after: string | null;
  changed: boolean;
}) {
  if (!changed) {
    return (
      <div className="text-xs">
        <span className="text-gray-400">{label}:</span>{' '}
        <span className="text-gray-700">{after ?? '—'}</span>
      </div>
    );
  }
  return (
    <div className="text-xs">
      <span className="text-gray-400">{label}:</span>{' '}
      <span className="text-gray-400 line-through">{before ?? '—'}</span>
      <span className="mx-1 text-gray-400">→</span>
      <span className="font-medium text-amber-700">{after ?? '—'}</span>
    </div>
  );
}

function SessionCard({ s }: { s: SessionDetail }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <StatusBadge status={s.status} />
        <span>{formatDateTime(s.createdAt)}</span>
        <span className="text-gray-400">·</span>
        <span className="font-mono">{s.type}</span>
        {s.promptVersion && (
          <>
            <span className="text-gray-400">·</span>
            <span className="font-mono">{s.promptVersion}</span>
          </>
        )}
        <span className="ml-auto font-mono text-gray-400">{s.id.slice(0, 8)}</span>
      </div>

      <div className="mb-4">
        <div className="text-[11px] font-semibold text-gray-500">入力本文</div>
        <pre className="mt-1 whitespace-pre-wrap rounded border border-gray-100 bg-gray-50 p-3 text-sm text-gray-800">
{s.inputText}
        </pre>
        {s.inputTextRedacted && s.inputTextRedacted !== s.inputText && (
          <details className="mt-2 text-[11px] text-gray-500">
            <summary className="cursor-pointer">PII マスク後 (Bedrock 入力)</summary>
            <pre className="mt-1 whitespace-pre-wrap rounded border border-gray-100 bg-gray-50 p-2 text-xs text-gray-700">
{s.inputTextRedacted}
            </pre>
          </details>
        )}
      </div>

      <div className="mb-4">
        <div className="text-[11px] font-semibold text-gray-500">
          AI 提案 (extraction.tasks)
        </div>
        {!s.extraction || s.extraction.tasks.length === 0 ? (
          <p className="mt-1 text-xs text-gray-400">候補なし</p>
        ) : (
          <ol className="mt-1 space-y-1.5">
            {s.extraction.tasks.map((t, i) => (
              <li
                key={i}
                className="rounded border border-gray-100 bg-gray-50 p-2 text-xs text-gray-700"
              >
                <div className="font-medium text-gray-900">{t.title}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                  <span>カテゴリ: {t.categoryId ?? '—'}</span>
                  <span>期限: {t.dueDate ?? '—'}</span>
                  <span>信頼度: {t.confidence || '—'}</span>
                </div>
                {t.memo && (
                  <div className="mt-1 text-[11px] text-gray-500">メモ: {t.memo}</div>
                )}
              </li>
            ))}
          </ol>
        )}
        {s.extraction?.needsConfirmation &&
          s.extraction.needsConfirmation.length > 0 && (
            <div className="mt-2 text-[11px] text-amber-700">
              要確認: {s.extraction.needsConfirmation.join(' / ')}
            </div>
          )}
      </div>

      {s.userConfirmed && s.userConfirmed.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] font-semibold text-gray-500">
            教員確定 (userConfirmed)
            {s.confirmedAt && (
              <span className="ml-2 font-normal text-gray-400">
                · {formatDateTime(s.confirmedAt)}
              </span>
            )}
          </div>
          <ol className="mt-1 space-y-2">
            {s.userConfirmed.map((c, i) => (
              <li
                key={i}
                className="rounded border border-gray-100 bg-emerald-50/30 p-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-900">
                    {c.title}
                  </span>
                  {!c.taskCreated && (
                    <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600">
                      task 未作成
                    </span>
                  )}
                </div>
                <div className="mt-1.5 space-y-1">
                  <DiffPair
                    label="タイトル"
                    before={c.aiSuggestedTitle}
                    after={c.title}
                    changed={c.titleChanged}
                  />
                  <DiffPair
                    label="カテゴリ"
                    before={c.aiSuggestedParentName}
                    after={c.userSelectedParentName}
                    changed={c.categoryChanged}
                  />
                  <DiffPair
                    label="期限"
                    before={c.aiSuggestedDueDate}
                    after={c.dueDate}
                    changed={c.dueDateChanged}
                  />
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {s.status === 'discarded' && (
        <div className="mb-4 rounded border border-orange-100 bg-orange-50/50 p-3 text-xs">
          <div className="font-semibold text-orange-700">破棄</div>
          <div className="mt-1 text-gray-700">
            理由: {s.discardReason ? reasonLabel(s.discardReason) : '(未選択)'}
          </div>
          {s.discardReasonText && (
            <div className="mt-1 whitespace-pre-wrap text-gray-700">
              {s.discardReasonText}
            </div>
          )}
          {s.discardedAt && (
            <div className="mt-1 text-[11px] text-gray-400">
              {formatDateTime(s.discardedAt)}
            </div>
          )}
        </div>
      )}

      {(s.editReason || s.editReasonText) && (
        <div className="rounded border border-gray-100 bg-gray-50 p-3 text-xs">
          <div className="font-semibold text-gray-600">編集理由</div>
          {s.editReason && (
            <div className="mt-1 text-gray-700">
              {reasonLabel(s.editReason)}
            </div>
          )}
          {s.editReasonText && (
            <div className="mt-1 whitespace-pre-wrap text-gray-700">
              {s.editReasonText}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function ScoreHistogram({
  label,
  caption,
  data,
}: {
  label: string;
  caption?: string;
  data: Array<{ score: number; count: number }>;
}) {
  // 1〜5 を必ず全部表示 (0 件のスコアもバーの空欄として出す)
  const full = [1, 2, 3, 4, 5].map((s) => ({
    score: s,
    count: data.find((d) => d.score === s)?.count ?? 0,
  }));
  const total = full.reduce((sum, d) => sum + d.count, 0);
  const max = Math.max(1, ...full.map((d) => d.count));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-xs font-semibold text-gray-600">{label}</h3>
      <p className="mb-3 text-[11px] text-gray-400">
        回答数 {total}
        {caption ? ` · ${caption}` : ''}
      </p>
      <div className="space-y-1.5">
        {full.map((d) => {
          const width = (d.count / max) * 100;
          const ratio = total === 0 ? 0 : (d.count / total) * 100;
          return (
            <div key={d.score} className="flex items-center gap-3 text-sm">
              <div className="w-4 shrink-0 text-right tabular-nums text-gray-700">
                {d.score}
              </div>
              <div className="relative h-5 flex-1 overflow-hidden rounded bg-gray-100">
                <div
                  className="absolute inset-y-0 left-0 bg-vn-accent/70"
                  style={{ width: `${width}%` }}
                />
              </div>
              <div className="w-10 shrink-0 text-right tabular-nums text-gray-600">
                {d.count}
              </div>
              <div className="w-12 shrink-0 text-right text-[11px] tabular-nums text-gray-400">
                {total === 0 ? '—' : `${ratio.toFixed(1)}%`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DailyCountLineChart({
  data,
  caption,
}: {
  data: Array<{ date: string; count: number }>;
  caption: string;
}) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">
        日別利用数 (過去 30 日)
      </h2>
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <p className="mb-3 text-[11px] text-gray-400">
          {caption} · 期間合計 {total} 件
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart
            data={data}
            margin={{ top: 5, right: 16, bottom: 5, left: -16 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: '#6b7280' }}
            />
            <Tooltip
              labelFormatter={(v) => v}
              formatter={(value: unknown) => [`${value} 件`, '利用数']}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#4f46e5"
              strokeWidth={2}
              dot={{ r: 3, fill: '#4f46e5' }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export default function AiAnalyticsPage({ session }: AiAnalyticsPageProps) {
  const [data, setData] = useState<AiAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'h1' | 'h3'>('h1');

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
                <>
                  <div className="mb-6 border-b border-gray-200">
                    <nav className="-mb-px flex gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('h1')}
                        className={`border-b-2 px-4 py-2 text-sm font-medium ${
                          activeTab === 'h1'
                            ? 'border-vn-accent text-vn-accent'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        タスク AI 整理 (H1)
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('h3')}
                        className={`border-b-2 px-4 py-2 text-sm font-medium ${
                          activeTab === 'h3'
                            ? 'border-vn-accent text-vn-accent'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        朝の見通し作り (H3)
                      </button>
                    </nav>
                  </div>
                  <div className="space-y-8">
                  {activeTab === 'h1' && (
                    <>
                  <DailyCountLineChart
                    data={data.dailyCounts.h1}
                    caption="テキスト入力 → AI 整理 (整理ボタン)"
                  />
                  {/* 主指標 */}
                  <section>
                    <h2 className="mb-3 text-sm font-semibold text-gray-700">
                      主指標 (H1 検証)
                    </h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <MetricCard
                        label="タスク候補作成確定率"
                        value={formatPercent(
                          data.summary.confirmedCount,
                          decisionTotal,
                        )}
                        caption={`確定 ${data.summary.confirmedCount} / 決定 ${decisionTotal}`}
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
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <MetricCard
                        label="生成後破棄率 (危険域: 70%以上)"
                        value={formatPercent(
                          data.summary.discardedCount,
                          decisionTotal,
                        )}
                        caption={`破棄 ${data.summary.discardedCount} / 決定 ${decisionTotal}`}
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

                  {/* セッション詳細 (最新 50 件、入力 → AI 提案 → 教員確定) */}
                  <section>
                    <h2 className="mb-3 text-sm font-semibold text-gray-700">
                      セッション詳細 (最新 {data.sessions.length} 件)
                    </h2>
                    <p className="mb-3 text-xs text-gray-500">
                      入力本文 → AI 提案 → 教員確定の流れ。差分はオレンジで強調。
                      system_admin 専用。
                    </p>
                    {data.sessions.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        まだセッションがありません
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {data.sessions.map((s) => (
                          <SessionCard key={s.id} s={s} />
                        ))}
                      </div>
                    )}
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

                    </>
                  )}
                  {activeTab === 'h3' && (
                    <>
                  <DailyCountLineChart
                    data={data.dailyCounts.h3}
                    caption="見通しを作る クリック"
                  />
                  <MorningPlanMainMetrics mp={data.morningPlan} />
                  <MorningPlanFunnel mp={data.morningPlan} />
                  <MorningPlanGuardrails mp={data.morningPlan} />
                  <MorningPlanDoneBreakdown mp={data.morningPlan} />
                  <MorningPlanBuckets mp={data.morningPlan} />
                  <MorningPlanCapacityCross mp={data.morningPlan} />
                  <MorningPlanContinuity mp={data.morningPlan} />
                    </>
                  )}
                  </div>
                </>
              )}
            </div>
          </div>
        </AdminLayout>
      </RoleGuard>
    </TenantGuard>
  );
}

// ── H3 morning_plan セクション群 ──────────────────────────────

function formatRate(value: number | null): string {
  if (value == null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function MorningPlanMainMetrics({ mp }: { mp: AiAnalyticsResponse['morningPlan'] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">主指標 (H3 検証)</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="今日のプラン開始率"
          value={formatRate(mp.funnel.startedRate)}
          caption={`開始 ${mp.funnel.startedCount} / 生成 ${mp.funnel.generatedCount}`}
        />
        <MetricCard
          label="Done 発生率"
          value={formatRate(mp.done.doneRate)}
          caption={`Done ${mp.done.doneCount} / 開始セッションの items ${mp.done.totalItemsInStartedSessions}`}
        />
        <MetricCard
          label="見通しが持てた率"
          value={formatRate(mp.outlook.outlookHeldRate)}
          caption={`持てた+少し ${mp.outlook.heldCount + mp.outlook.somewhatCount} / 回答 ${mp.outlook.feedbackCount}`}
        />
      </div>
    </section>
  );
}

function MorningPlanFunnel({ mp }: { mp: AiAnalyticsResponse['morningPlan'] }) {
  const f = mp.funnel;
  const max = Math.max(1, f.totalSessions);
  const steps: Array<{ label: string; count: number; rate: number | null }> = [
    { label: '整理セッション開始', count: f.totalSessions, rate: 1 },
    { label: '余裕選択', count: f.capacitySelectedCount, rate: f.capacitySelectedRate },
    { label: 'AI 提案生成', count: f.generatedCount, rate: f.generatedRate },
    { label: '今日を始める', count: f.startedCount, rate: f.startedRate },
  ];
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">
        ファネル (整理 → 始める)
      </h2>
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        {steps.map((s) => (
          <div key={s.label} className="flex items-center gap-3 py-1.5 text-sm">
            <div className="w-40 shrink-0 text-gray-700">{s.label}</div>
            <div className="relative h-5 flex-1 overflow-hidden rounded bg-gray-100">
              <div
                className="absolute inset-y-0 left-0 bg-vn-accent/70"
                style={{ width: `${(s.count / max) * 100}%` }}
              />
            </div>
            <div className="w-12 shrink-0 text-right tabular-nums text-gray-600">
              {s.count}
            </div>
            <div className="w-14 shrink-0 text-right text-[11px] tabular-nums text-gray-400">
              {s.rate == null ? '—' : `${(s.rate * 100).toFixed(1)}%`}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        編集開始: {f.editStartedCount} ({formatRate(f.editStartedRate)})
      </p>
    </section>
  );
}

function MorningPlanGuardrails({ mp }: { mp: AiAnalyticsResponse['morningPlan'] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">ガードレール</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="AI 提案後 即閉じ率"
          value={formatRate(mp.funnel.closedAfterGenerationRate)}
          caption={`生成 ${mp.funnel.generatedCount} のうち閉じる ${mp.funnel.closedWithoutStartCount}`}
        />
        <MetricCard
          label="編集開始率 (≧70% で警告)"
          value={formatRate(mp.funnel.editStartedRate)}
          caption={`編集開始 ${mp.funnel.editStartedCount} / 生成 ${mp.funnel.generatedCount}`}
        />
        <MetricCard
          label="Done ゼロ率"
          value={formatRate(mp.done.zeroDoneSessionRate)}
          caption={`Done 0 件 ${mp.done.zeroDoneSessions} / 開始 ${mp.done.startedSessions}`}
        />
      </div>
    </section>
  );
}

function MorningPlanDoneBreakdown({ mp }: { mp: AiAnalyticsResponse['morningPlan'] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">
        Done 内訳 (bucket 別)
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricCard
          label="今日やる タスク Done 率"
          value={formatRate(mp.done.todayBucketDoneRate)}
          caption={`Done ${mp.done.todayBucketDoneCount} / 今日やる ${mp.done.todayBucketTotal}`}
        />
        <MetricCard
          label="余裕があれば タスク Done 率"
          value={formatRate(mp.done.optionalBucketDoneRate)}
          caption={`Done ${mp.done.optionalBucketDoneCount} / 余裕があれば ${mp.done.optionalBucketTotal}`}
        />
      </div>
    </section>
  );
}

function MorningPlanBuckets({ mp }: { mp: AiAnalyticsResponse['morningPlan'] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">
        AI 分類精度 (今日やる / 余裕があれば)
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="AI 分類維持率"
          value={formatRate(
            mp.buckets.totalItems === 0
              ? null
              : mp.buckets.retainedCount / mp.buckets.totalItems,
          )}
          caption={`維持 ${mp.buckets.retainedCount} / 全 ${mp.buckets.totalItems}`}
        />
        <MetricCard
          label="今日やる → 余裕があれば 移動"
          value={`${mp.buckets.todayToOptional}`}
          caption="AI が詰め込みすぎ (多いと注意)"
        />
        <MetricCard
          label="余裕があれば → 今日やる 移動"
          value={`${mp.buckets.optionalToToday}`}
          caption="AI が控えめすぎ (多いと注意)"
        />
        <MetricCard
          label="AI 提案除外率"
          value={formatRate(mp.buckets.excludedRate)}
          caption={`今日やらない ${mp.buckets.excludedCount} / 全 ${mp.buckets.totalItems}`}
        />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricCard
          label="手動追加率 (AI 提案外)"
          value={formatRate(mp.buckets.userAddedRate)}
          caption={`手動追加 ${mp.buckets.userAddedCount} / 全 ${mp.buckets.totalItems} (AI 提案が足りなかった指標)`}
        />
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        AI 提案分布: 今日やる {mp.buckets.aiTodayCount} / 余裕があれば {mp.buckets.aiOptionalCount}
      </p>
    </section>
  );
}

function MorningPlanCapacityCross({ mp }: { mp: AiAnalyticsResponse['morningPlan'] }) {
  const labels: Record<'low' | 'normal' | 'high', string> = {
    low: '少なめ',
    normal: 'ふつう',
    high: '少しある',
  };
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">
        余裕レベル別 (AI 出し分けが効いてるか)
      </h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium text-gray-600">余裕レベル</th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">
                セッション数
              </th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">
                開始率
              </th>
              <th className="px-4 py-2 text-right font-medium text-gray-600">
                編集率
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {mp.capacityCross.map((c) => (
              <tr key={c.capacity}>
                <td className="px-4 py-2 text-gray-700">{labels[c.capacity]}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {c.sessionCount}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatRate(c.startedRate)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatRate(c.editRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MorningPlanContinuity({ mp }: { mp: AiAnalyticsResponse['morningPlan'] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">継続 (過去 14 日)</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="翌日再訪率"
          value={formatRate(mp.nextDayReturn.nextDayReturnRate)}
          caption={`連続ユーザー ${mp.nextDayReturn.consecutiveUsers} / 利用ユーザー ${mp.nextDayReturn.uniqueUsers}`}
        />
        <MetricCard
          label="見通しスコア分布"
          value={
            mp.outlook.feedbackCount === 0
              ? '—'
              : `${mp.outlook.heldCount}/${mp.outlook.somewhatCount}/${mp.outlook.difficultCount}`
          }
          caption="持てた / 少し / まだ"
        />
      </div>
    </section>
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
