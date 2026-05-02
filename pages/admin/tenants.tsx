// system_admin 用テナント管理画面（US-S-001・US-S-002 実装）
import { useState, useEffect } from 'react';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
// system_admin は tenantId を持たないため withAuthSSR（tenantId 必須チェックあり）は使わない
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import type { VitanotaSession } from '@/shared/types/auth';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  createdAt: string;
}

interface TenantsPageProps {
  session: VitanotaSession;
}

export default function TenantsPage({ session }: TenantsPageProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function fetchTenants() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/system/tenants');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setTenants(data.tenants);
    } catch {
      setError('テナント一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTenants(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/system/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setName('');
      setSlug('');
      await fetchTenants();
    } catch (err: any) {
      setError(err.message ?? 'テナントの作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(tenant: Tenant) {
    const newStatus = tenant.status === 'active' ? 'suspended' : 'active';
    try {
      const res = await fetch('/api/system/tenants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tenant.id, status: newStatus }),
      });
      if (!res.ok) throw new Error();
      await fetchTenants();
    } catch {
      setError('テナント状態の変更に失敗しました');
    }
  }

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="system_admin">
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="mx-auto max-w-4xl">
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-2xl font-bold text-gray-800">テナント管理</h1>
              <span className="text-sm text-gray-500">vitanota system admin</span>
            </div>

            {/* テナント作成フォーム */}
            <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-gray-700">新規テナント作成</h2>
              {error && <div className="mb-4"><ErrorMessage message={error} onRetry={fetchTenants} /></div>}
              <form onSubmit={handleCreate} className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-1 block text-sm text-gray-600" htmlFor="tenant-name">学校名</label>
                  <input
                    id="tenant-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="〇〇小学校"
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    data-testid="tenant-name-input"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-sm text-gray-600" htmlFor="tenant-slug">スラグ（URLキー）</label>
                  <input
                    id="tenant-slug"
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="honjo-elementary"
                    required
                    pattern="^[a-z0-9-]+$"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    data-testid="tenant-slug-input"
                  />
                </div>
                <Button
                  type="submit"
                  isLoading={submitting}
                  data-testid="tenant-create-button"
                >
                  作成
                </Button>
              </form>
            </div>

            {/* テナント一覧 */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-700">テナント一覧</h2>
              </div>
              {loading ? (
                <div className="flex justify-center py-12">
                  <LoadingSpinner size="lg" label="テナント一覧を読み込み中" />
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-6 py-3 text-left">学校名</th>
                      <th className="px-6 py-3 text-left">スラグ</th>
                      <th className="px-6 py-3 text-left">ステータス</th>
                      <th className="px-6 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tenants.map((tenant) => (
                      <tr key={tenant.id} data-testid={`tenant-row-${tenant.id}`}>
                        <td className="px-6 py-4 font-medium text-gray-800">{tenant.name}</td>
                        <td className="px-6 py-4 text-gray-500">{tenant.slug}</td>
                        <td className="px-6 py-4">
                          <span className={[
                            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                            tenant.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700',
                          ].join(' ')}>
                            {tenant.status === 'active' ? '有効' : '停止中'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/admin/invitations?tenantId=${tenant.id}`}
                              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                              data-testid={`tenant-invitations-link-${tenant.id}`}
                            >
                              招待管理
                            </Link>
                            <Button
                              variant={tenant.status === 'active' ? 'danger' : 'secondary'}
                              onClick={() => handleToggleStatus(tenant)}
                              className="text-xs"
                              data-testid={`tenant-toggle-${tenant.id}`}
                            >
                              {tenant.status === 'active' ? '停止' : '再開'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {tenants.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                          テナントがまだありません
                        </td>
                      </tr>
                    )}
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
