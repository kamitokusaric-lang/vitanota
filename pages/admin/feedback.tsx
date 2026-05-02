// 機能 B: system_admin 用 フィードバック投稿一覧画面
// テナント別 / トピック別フィルタ + 一覧テーブル
import { useState, useEffect, useCallback } from 'react';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import type { VitanotaSession } from '@/shared/types/auth';

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

interface TopicSummary {
  id: string;
  title: string;
}

interface Submission {
  id: string;
  createdAt: string;
  content: string;
  topicId: string;
  topicTitle: string;
  userEmail: string;
  userName: string | null;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
}

interface PageProps {
  session: VitanotaSession;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function FeedbackListPage({ session }: PageProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [tenantFilter, setTenantFilter] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (tenantFilter) params.set('tenantId', tenantFilter);
      if (topicFilter) params.set('topicId', topicFilter);
      const res = await fetch(`/api/system/feedback?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? '取得失敗');
      setSubmissions(data.submissions);
    } catch {
      setError('投稿一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [tenantFilter, topicFilter]);

  useEffect(() => {
    Promise.all([
      fetch('/api/system/tenants').then((r) => r.json()),
      fetch('/api/system/feedback/topics').then((r) => r.json()),
    ])
      .then(([tenantData, topicData]) => {
        setTenants(tenantData.tenants ?? []);
        setTopics(
          (topicData.topics ?? []).map((t: { id: string; title: string }) => ({
            id: t.id,
            title: t.title,
          })),
        );
      })
      .catch(() => setError('フィルタ用データの取得に失敗しました'));
  }, []);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="system_admin">
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-2xl font-bold text-gray-800">フィードバック投稿一覧</h1>
              <div className="flex gap-3 text-sm">
                <Link href="/admin/tenants" className="text-blue-600 hover:underline">
                  テナント管理
                </Link>
                <Link href="/admin/feedback/topics" className="text-blue-600 hover:underline">
                  トピック管理 →
                </Link>
              </div>
            </div>

            {error && (
              <div className="mb-4">
                <ErrorMessage message={error} onRetry={fetchSubmissions} />
              </div>
            )}

            {/* フィルタ */}
            <div className="mb-6 flex flex-wrap gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div>
                <label htmlFor="filter-tenant" className="mb-1 block text-xs text-gray-500">
                  テナント
                </label>
                <select
                  id="filter-tenant"
                  value={tenantFilter}
                  onChange={(e) => setTenantFilter(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                  data-testid="filter-tenant"
                >
                  <option value="">全テナント</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="filter-topic" className="mb-1 block text-xs text-gray-500">
                  トピック
                </label>
                <select
                  id="filter-topic"
                  value={topicFilter}
                  onChange={(e) => setTopicFilter(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                  data-testid="filter-topic"
                >
                  <option value="">全トピック</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 投稿一覧テーブル */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-700">
                  投稿 {submissions.length > 0 && <span className="text-sm font-normal text-gray-500">({submissions.length} 件)</span>}
                </h2>
              </div>
              {loading ? (
                <div className="flex justify-center py-12">
                  <LoadingSpinner size="lg" label="投稿一覧を読み込み中" />
                </div>
              ) : submissions.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-400">
                  該当する投稿はありません
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left whitespace-nowrap">投稿日時</th>
                      <th className="px-4 py-3 text-left whitespace-nowrap">トピック</th>
                      <th className="px-4 py-3 text-left whitespace-nowrap">投稿者</th>
                      <th className="px-4 py-3 text-left whitespace-nowrap">テナント</th>
                      <th className="px-4 py-3 text-left">本文</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {submissions.map((s) => (
                      <tr key={s.id} data-testid={`submission-row-${s.id}`}>
                        <td className="px-4 py-3 align-top text-gray-600 whitespace-nowrap">
                          {formatDateTime(s.createdAt)}
                        </td>
                        <td className="px-4 py-3 align-top text-gray-700 whitespace-nowrap">
                          {s.topicTitle}
                        </td>
                        <td className="px-4 py-3 align-top text-gray-600 whitespace-nowrap">
                          <div>{s.userName ?? '—'}</div>
                          <div className="text-xs text-gray-400">{s.userEmail}</div>
                        </td>
                        <td className="px-4 py-3 align-top text-gray-600 whitespace-nowrap">
                          {s.tenantName}
                        </td>
                        <td className="px-4 py-3 align-top text-gray-800 whitespace-pre-wrap break-words">
                          {s.content}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }
  if (!session.user.roles.includes('system_admin')) {
    return { redirect: { destination: '/', permanent: false } };
  }
  return { props: { session } };
};
