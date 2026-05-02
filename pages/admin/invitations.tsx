// 機能 A: system_admin 招待管理画面
// テナント別に一覧表示 + 一括投入 + 期限切れ再発行
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { useToast } from '@/shared/components/Toast';
import type { VitanotaSession } from '@/shared/types/auth';

type InvitationStatus = 'accepted' | 'pending' | 'expired';
type InvitationRole = 'teacher' | 'school_admin';

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

interface Invitation {
  id: string;
  email: string;
  role: InvitationRole;
  invitedAt: string;
  expiresAt: string;
  usedAt: string | null;
  status: InvitationStatus;
  inviteUrl: string | null;
  lastAccessedAt: string | null;
}

interface BulkResultItem {
  email: string;
  status: 'created' | 'failed';
  invitation?: { id: string; expiresAt: string; inviteUrl: string };
  error?: string;
}

interface InvitationsPageProps {
  session: VitanotaSession;
}

const STATUS_BADGE: Record<InvitationStatus, { label: string; className: string }> = {
  accepted: { label: '受諾済', className: 'bg-green-100 text-green-700' },
  pending: { label: '未受諾', className: 'bg-blue-100 text-blue-700' },
  expired: { label: '期限切れ', className: 'bg-gray-200 text-gray-600' },
};

const ROLE_LABEL: Record<InvitationRole, string> = {
  teacher: '教員',
  school_admin: '学校管理者',
};

function parseEmails(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function InvitationsPage({ session }: InvitationsPageProps) {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState<string>('');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [emailsRaw, setEmailsRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResultItem[] | null>(null);

  const parsedEmails = useMemo(() => parseEmails(emailsRaw), [emailsRaw]);

  const fetchTenants = useCallback(async () => {
    setLoadingTenants(true);
    setError(null);
    try {
      const res = await fetch('/api/system/tenants');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'テナント一覧取得失敗');
      setTenants(data.tenants);
      const queryTenantId = typeof router.query.tenantId === 'string' ? router.query.tenantId : '';
      const initial = queryTenantId && data.tenants.some((t: Tenant) => t.id === queryTenantId)
        ? queryTenantId
        : (data.tenants[0]?.id ?? '');
      setTenantId(initial);
    } catch {
      setError('テナント一覧の取得に失敗しました');
    } finally {
      setLoadingTenants(false);
    }
  }, [router.query.tenantId]);

  const fetchInvitations = useCallback(async (tid: string) => {
    if (!tid) return;
    setLoadingInvitations(true);
    setError(null);
    try {
      const res = await fetch(`/api/system/invitations?tenantId=${encodeURIComponent(tid)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? '招待一覧取得失敗');
      setInvitations(data.invitations);
    } catch {
      setError('招待一覧の取得に失敗しました');
    } finally {
      setLoadingInvitations(false);
    }
  }, []);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);
  useEffect(() => {
    if (tenantId) fetchInvitations(tenantId);
  }, [tenantId, fetchInvitations]);

  async function handleBulkSubmit(role: InvitationRole) {
    if (!tenantId) return;
    if (parsedEmails.length === 0) {
      setError('メールアドレスを 1 件以上入力してください');
      return;
    }
    if (role === 'school_admin') {
      const ok = window.confirm(
        `${parsedEmails.length} 件を「学校管理者 (school_admin)」として一括招待します。よろしいですか？`
      );
      if (!ok) return;
    }
    setSubmitting(true);
    setError(null);
    setBulkResult(null);
    try {
      const res = await fetch('/api/system/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, emails: parsedEmails, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? '一括招待失敗');
      setBulkResult(data.results);
      setEmailsRaw('');
      await fetchInvitations(tenantId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '一括招待に失敗しました';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="system_admin">
        <AdminLayout session={session}>
        <div className="p-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-2xl font-bold text-gray-800">招待管理</h1>
              <Link
                href="/admin/tenants"
                className="text-sm text-blue-600 hover:underline"
              >
                ← テナント管理へ戻る
              </Link>
            </div>

            {error && (
              <div className="mb-4">
                <ErrorMessage message={error} onRetry={() => fetchInvitations(tenantId)} />
              </div>
            )}

            {/* テナントセレクタ */}
            <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <label htmlFor="tenant-select" className="mb-2 block text-sm font-medium text-gray-700">
                対象テナント
              </label>
              {loadingTenants ? (
                <LoadingSpinner size="sm" label="テナント一覧読込中" />
              ) : (
                <select
                  id="tenant-select"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm"
                  data-testid="tenant-select"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.slug})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* 一括招待フォーム */}
            <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-gray-700">一括招待</h2>
              <textarea
                value={emailsRaw}
                onChange={(e) => setEmailsRaw(e.target.value)}
                placeholder={`teacher1@example.com\nteacher2@example.com\n... (改行 or カンマ区切り、最大 100 件)`}
                rows={6}
                className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none"
                data-testid="bulk-emails-textarea"
              />
              <div className="mt-2 text-xs text-gray-500">
                {parsedEmails.length} 件のメールアドレスを認識
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  onClick={() => handleBulkSubmit('teacher')}
                  isLoading={submitting}
                  disabled={parsedEmails.length === 0 || !tenantId}
                  data-testid="bulk-invite-teacher-button"
                >
                  全員 教員として一括招待
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleBulkSubmit('school_admin')}
                  isLoading={submitting}
                  disabled={parsedEmails.length === 0 || !tenantId}
                  data-testid="bulk-invite-school-admin-button"
                >
                  全員 学校管理者として一括招待
                </Button>
              </div>

              {bulkResult && (
                <BulkResultSummary results={bulkResult} />
              )}
            </div>

            {/* 招待一覧 */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-700">
                  招待一覧 {invitations.length > 0 && <span className="text-sm font-normal text-gray-500">({invitations.length} 件)</span>}
                </h2>
              </div>
              {loadingInvitations ? (
                <div className="flex justify-center py-12">
                  <LoadingSpinner size="lg" label="招待一覧を読み込み中" />
                </div>
              ) : invitations.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-400">
                  招待がまだありません
                </div>
              ) : (
                <InvitationsTable
                  invitations={invitations}
                  tenantId={tenantId}
                  onReissued={() => fetchInvitations(tenantId)}
                />
              )}
            </div>
          </div>
        </div>
        </AdminLayout>
      </RoleGuard>
    </TenantGuard>
  );
}

function BulkResultSummary({ results }: { results: BulkResultItem[] }) {
  const created = results.filter((r) => r.status === 'created');
  const failed = results.filter((r) => r.status === 'failed');
  return (
    <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm" data-testid="bulk-result-summary">
      <div className="font-medium text-gray-700">
        ✅ 投入結果: {created.length} 件成功 / {failed.length} 件失敗
      </div>
      {failed.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-red-700">
          {failed.map((f, i) => (
            <li key={`${f.email}-${i}`}>
              {f.email}: {f.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InvitationsTable({
  invitations,
  tenantId,
  onReissued,
}: {
  invitations: Invitation[];
  tenantId: string;
  onReissued: () => void;
}) {
  const { showToast } = useToast();
  const [reissuing, setReissuing] = useState<string | null>(null);

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      showToast('招待 URL をコピーしました', 'success');
    } catch {
      showToast('コピーに失敗しました', 'error');
    }
  }

  async function handleReissue(inv: Invitation) {
    if (inv.status === 'pending') {
      const ok = window.confirm(
        `${inv.email} の招待 URL を再発行します。既存の URL は無効になります。よろしいですか？`
      );
      if (!ok) return;
    }
    setReissuing(inv.id);
    try {
      const res = await fetch('/api/system/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, emails: [inv.email], role: inv.role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? '再発行失敗');
      showToast(`${inv.email} の招待を再発行しました`, 'success');
      onReissued();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '再発行に失敗しました';
      showToast(message, 'error');
    } finally {
      setReissuing(null);
    }
  }

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-xs uppercase text-gray-500">
        <tr>
          <th className="px-4 py-3 text-left">Email</th>
          <th className="px-4 py-3 text-left">ロール</th>
          <th className="px-4 py-3 text-left">招待日</th>
          <th className="px-4 py-3 text-left">期限</th>
          <th className="px-4 py-3 text-left">ステータス</th>
          <th className="px-4 py-3 text-right">操作</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {invitations.map((inv) => {
          const badge = STATUS_BADGE[inv.status];
          return (
            <tr key={inv.id} data-testid={`invitation-row-${inv.id}`}>
              <td className="px-4 py-3 font-medium text-gray-800">{inv.email}</td>
              <td className="px-4 py-3 text-gray-600">{ROLE_LABEL[inv.role]}</td>
              <td className="px-4 py-3 text-gray-600">{formatDate(inv.invitedAt)}</td>
              <td className="px-4 py-3 text-gray-600">{formatDate(inv.expiresAt)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                    {badge.label}
                    {inv.status === 'accepted' && inv.usedAt && (
                      <span className="ml-1 text-gray-600">({formatDateTime(inv.usedAt)})</span>
                    )}
                  </span>
                  {inv.status === 'accepted' && (
                    <span className="text-xs text-gray-500">
                      最終アクセス: {inv.lastAccessedAt ? formatDateTime(inv.lastAccessedAt) : '—'}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                {inv.status === 'pending' && inv.inviteUrl && (
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => handleCopy(inv.inviteUrl!)}
                      className="text-xs"
                      data-testid={`copy-button-${inv.id}`}
                    >
                      📋 コピー
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleReissue(inv)}
                      isLoading={reissuing === inv.id}
                      className="text-xs"
                      data-testid={`reissue-button-${inv.id}`}
                    >
                      🔄 再発行
                    </Button>
                  </div>
                )}
                {inv.status === 'expired' && (
                  <Button
                    onClick={() => handleReissue(inv)}
                    isLoading={reissuing === inv.id}
                    className="text-xs"
                    data-testid={`reissue-button-${inv.id}`}
                  >
                    🔄 再発行
                  </Button>
                )}
                {inv.status === 'accepted' && <span className="text-gray-400">—</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
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
