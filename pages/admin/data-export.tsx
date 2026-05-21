// system_admin: 職員室ノート (公開のみ) と タスク を CSV エクスポートする画面。
//
// chimo 絶対指示: 公開されている職員室ノートのみが出力される。
// 画面上にもその注記を視認できる位置に表示する (実体は journal-export API 側で
// public_journal_entries VIEW から SELECT して schema 層で固定済)。
import { useState, useEffect, useMemo } from 'react';
import type { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import type { VitanotaSession } from '@/shared/types/auth';

interface DataExportPageProps {
  session: VitanotaSession;
}

interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
}

function toJstDateString(d: Date): string {
  // YYYY-MM-DD (Asia/Tokyo)
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function defaultPeriod(): { from: string; to: string } {
  const now = new Date();
  const to = toJstDateString(now);
  const fromDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const from = toJstDateString(fromDate);
  return { from, to };
}

export default function DataExportPage({ session }: DataExportPageProps) {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [tenantId, setTenantId] = useState<string>('');
  const period = useMemo(defaultPeriod, []);
  const [from, setFrom] = useState<string>(period.from);
  const [to, setTo] = useState<string>(period.to);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/system/tenants');
        if (!r.ok) throw new Error(`status ${r.status}`);
        const j = (await r.json()) as { tenants: TenantSummary[] };
        if (cancelled) return;
        setTenants(j.tenants);
        if (j.tenants.length > 0) setTenantId(j.tenants[0].id);
      } catch (e) {
        if (cancelled) return;
        setLoadError('テナント一覧の取得に失敗しました');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const params = new URLSearchParams();
  if (tenantId) params.set('tenantId', tenantId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  const journalHref = `/api/system/journal-export?${qs}`;
  const taskHref = `/api/system/task-export?${qs}`;

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to);
  const periodOrderOk = !dateValid || from <= to;
  const ready = Boolean(tenantId) && dateValid && periodOrderOk;

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="system_admin">
        <AdminLayout session={session}>
          <div className="p-8">
            <div className="mx-auto max-w-3xl">
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">データエクスポート</h1>
                <p className="mt-2 text-sm text-gray-600">
                  指定したテナント・期間の職員室ノートとタスクを CSV でダウンロードします。
                </p>
                <p
                  className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
                  data-testid="data-export-public-only-notice"
                >
                  職員室ノートは <strong>公開されている投稿のみ</strong> が出力されます。
                  非公開の日々ノート (鍵付き) は CSV に含まれません。
                </p>
              </div>

              {loading && <LoadingSpinner />}
              {loadError && <ErrorMessage message={loadError} />}

              {!loading && !loadError && (
                <div className="space-y-6 rounded-lg border border-gray-200 bg-white p-6">
                  <div>
                    <label
                      htmlFor="tenant-select"
                      className="block text-sm font-semibold text-gray-700"
                    >
                      テナント
                    </label>
                    <select
                      id="tenant-select"
                      data-testid="data-export-tenant-select"
                      className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                      value={tenantId}
                      onChange={(e) => setTenantId(e.target.value)}
                    >
                      {tenants.length === 0 && <option value="">テナントなし</option>}
                      {tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.slug})
                          {t.status !== 'active' ? ` [${t.status}]` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="period-from"
                        className="block text-sm font-semibold text-gray-700"
                      >
                        開始日 (JST)
                      </label>
                      <input
                        id="period-from"
                        data-testid="data-export-from"
                        type="date"
                        className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="period-to"
                        className="block text-sm font-semibold text-gray-700"
                      >
                        終了日 (JST、包含)
                      </label>
                      <input
                        id="period-to"
                        data-testid="data-export-to"
                        type="date"
                        className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </div>
                  </div>

                  {!periodOrderOk && (
                    <p className="text-xs text-red-600">
                      終了日は開始日と同じか後の日付を指定してください。
                    </p>
                  )}

                  <div className="flex flex-wrap gap-3 pt-2">
                    <a
                      href={ready ? journalHref : undefined}
                      data-testid="data-export-journal-download"
                      aria-disabled={!ready}
                      className={
                        'inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors ' +
                        (ready
                          ? 'bg-vn-accent text-white hover:bg-vn-accent/90'
                          : 'cursor-not-allowed bg-gray-200 text-gray-400')
                      }
                      onClick={(e) => {
                        if (!ready) e.preventDefault();
                      }}
                    >
                      職員室ノート CSV をダウンロード
                    </a>
                    <a
                      href={ready ? taskHref : undefined}
                      data-testid="data-export-task-download"
                      aria-disabled={!ready}
                      className={
                        'inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium transition-colors ' +
                        (ready
                          ? 'border-gray-300 text-gray-800 hover:bg-gray-50'
                          : 'cursor-not-allowed border-gray-200 text-gray-400')
                      }
                      onClick={(e) => {
                        if (!ready) e.preventDefault();
                      }}
                    >
                      タスク CSV をダウンロード
                    </a>
                  </div>

                  <p className="text-[11px] text-gray-400">
                    出力形式は UTF-8 (BOM 付き) CSV、Excel で文字化けせずに開けます。
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

export const getServerSideProps: GetServerSideProps<DataExportPageProps> = async (
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
