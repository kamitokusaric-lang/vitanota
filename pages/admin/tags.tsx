// system_admin: タスクタグ管理画面
// テナント別の一覧 + 紐づきタスク数表示 + 新規 / 編集 / 削除 (タスク > 0 件は移動先指定)
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { AdminLayout } from '@/shared/components/AdminLayout';
import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Modal';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { useToast } from '@/shared/components/Toast';
import type { VitanotaSession } from '@/shared/types/auth';

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

interface TagRow {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  assignmentCount: number;
}

interface TagsPageProps {
  session: VitanotaSession;
}

interface EditState {
  kind: 'closed' | 'create' | 'edit' | 'delete';
  tag?: TagRow;
}

export default function TagsPage({ session }: TagsPageProps) {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantsError, setTenantsError] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [tags, setTags] = useState<TagRow[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>({ kind: 'closed' });
  const { showToast } = useToast();

  // テナント一覧取得
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/system/tenants');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { tenants: Tenant[] };
        setTenants(data.tenants);
        const initial = typeof router.query.tenantId === 'string'
          ? router.query.tenantId
          : data.tenants[0]?.id ?? '';
        setSelectedTenantId(initial);
      } catch (e) {
        setTenantsError('テナント一覧の取得に失敗しました');
      }
    };
    void load();
  }, [router.query.tenantId]);

  // タグ一覧取得
  const fetchTags = useCallback(async (tenantId: string) => {
    if (!tenantId) return;
    setTagsLoading(true);
    setTagsError(null);
    try {
      const res = await fetch(`/api/system/task-tags?tenantId=${tenantId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { tags: TagRow[] };
      setTags(data.tags);
    } catch (e) {
      setTagsError('タグ一覧の取得に失敗しました');
    } finally {
      setTagsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTenantId) {
      void fetchTags(selectedTenantId);
    }
  }, [selectedTenantId, fetchTags]);

  const handleTenantChange = (id: string) => {
    setSelectedTenantId(id);
    void router.replace(
      { pathname: router.pathname, query: { tenantId: id } },
      undefined,
      { shallow: true },
    );
  };

  const openCreate = () => setEdit({ kind: 'create' });
  const openEdit = (t: TagRow) => setEdit({ kind: 'edit', tag: t });
  const openDelete = (t: TagRow) => setEdit({ kind: 'delete', tag: t });
  const closeModal = () => setEdit({ kind: 'closed' });

  const handleCreated = (newTag: TagRow) => {
    setTags((prev) =>
      [...prev, newTag].sort((a, b) => a.name.localeCompare(b.name)),
    );
    closeModal();
    showToast('タグを作成しました', 'success');
  };

  const handleUpdated = (updated: TagRow) => {
    setTags((prev) =>
      prev
        .map((t) => (t.id === updated.id ? { ...t, ...updated, assignmentCount: t.assignmentCount } : t))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    closeModal();
    showToast('タグを更新しました', 'success');
  };

  const handleDeleted = (deletedId: string) => {
    setTags((prev) => prev.filter((t) => t.id !== deletedId));
    closeModal();
    showToast('タグを削除しました', 'success');
    // 移管した場合、移動先タグの assignmentCount が変わっているので再取得
    if (selectedTenantId) {
      void fetchTags(selectedTenantId);
    }
  };

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="system_admin">
        <AdminLayout session={session}>
          <div className="p-8">
            <div className="mx-auto max-w-6xl">
              <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">
                  タグ管理
                </h1>
              </div>
              <div className="space-y-4">
                {tenantsError && <ErrorMessage message={tenantsError} />}

                {/* テナント選択 */}
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="tenant-select"
                    className="text-sm font-medium text-gray-700"
                  >
                    テナント:
                  </label>
                  <select
                    id="tenant-select"
                    value={selectedTenantId}
                    onChange={(e) => handleTenantChange(e.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    data-testid="admin-tags-tenant-select"
                  >
                    {tenants.length === 0 && <option value="">(読込中)</option>}
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex-1" />
                  <Button
                    type="button"
                    onClick={openCreate}
                    disabled={!selectedTenantId}
                    data-testid="admin-tags-new-button"
                  >
                    + 新規追加
                  </Button>
                </div>

                {tagsLoading && <LoadingSpinner />}
                {tagsError && <ErrorMessage message={tagsError} />}
                {!tagsLoading && tags.length === 0 && !tagsError && (
                  <p className="text-sm text-gray-500">
                    このテナントにはタグがありません。
                  </p>
                )}
                {!tagsLoading && tags.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table
                      className="min-w-full divide-y divide-gray-200"
                      data-testid="admin-tags-table"
                    >
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                            名前
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                            紐づきタスク
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                            操作
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {tags.map((t) => (
                          <tr key={t.id} data-testid={`admin-tag-row-${t.id}`}>
                            <td className="px-4 py-2 text-sm text-gray-900">#{t.name}</td>
                            <td className="px-4 py-2 text-sm text-gray-700">
                              {t.assignmentCount} 件
                            </td>
                            <td className="px-4 py-2 text-right text-sm">
                              <button
                                type="button"
                                onClick={() => openEdit(t)}
                                className="mr-2 text-blue-600 hover:underline"
                                data-testid={`admin-tag-edit-${t.id}`}
                              >
                                編集
                              </button>
                              <button
                                type="button"
                                onClick={() => openDelete(t)}
                                className="text-red-600 hover:underline"
                                data-testid={`admin-tag-delete-${t.id}`}
                              >
                                削除
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {(edit.kind === 'create' || edit.kind === 'edit') && (
                  <TagFormModal
                    mode={edit.kind}
                    tenantId={selectedTenantId}
                    initial={edit.tag}
                    onClose={closeModal}
                    onCreated={handleCreated}
                    onUpdated={handleUpdated}
                  />
                )}

                {edit.kind === 'delete' && edit.tag && (
                  <TagDeleteModal
                    tag={edit.tag}
                    otherTags={tags.filter((t) => t.id !== edit.tag!.id)}
                    onClose={closeModal}
                    onDeleted={handleDeleted}
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

// ────────────────────────────────────────────────────────────
// 新規 / 編集 モーダル
// ────────────────────────────────────────────────────────────

interface TagFormModalProps {
  mode: 'create' | 'edit';
  tenantId: string;
  initial?: TagRow;
  onClose: () => void;
  onCreated: (t: TagRow) => void;
  onUpdated: (t: TagRow) => void;
}

function TagFormModal({
  mode,
  tenantId,
  initial,
  onClose,
  onCreated,
  onUpdated,
}: TagFormModalProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'create') {
        const res = await fetch('/api/system/task-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId,
            name: name.trim(),
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          tag?: TagRow;
          message?: string;
        };
        if (!res.ok) {
          throw new Error(body.message ?? `HTTP ${res.status}`);
        }
        if (body.tag) {
          onCreated({ ...body.tag, assignmentCount: 0 });
        }
      } else if (mode === 'edit' && initial) {
        const res = await fetch(`/api/system/task-tags/${initial.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim() }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          tag?: TagRow;
          message?: string;
        };
        if (!res.ok) {
          throw new Error(body.message ?? `HTTP ${res.status}`);
        }
        if (body.tag) {
          onUpdated({ ...body.tag, assignmentCount: initial.assignmentCount });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'create' ? 'タグ新規追加' : 'タグ編集'}
    >
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            名前
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            data-testid="admin-tag-form-name"
          />
          <p className="mt-0.5 text-xs text-gray-400">{name.length} / 100</p>
        </div>

        {error && <ErrorMessage message={error} />}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={submit}
            isLoading={submitting}
            disabled={name.trim().length === 0}
            data-testid="admin-tag-form-submit"
          >
            {mode === 'create' ? '作成' : '保存'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────
// 削除モーダル
// ────────────────────────────────────────────────────────────

interface TagDeleteModalProps {
  tag: TagRow;
  otherTags: TagRow[];
  onClose: () => void;
  onDeleted: (id: string) => void;
}

function TagDeleteModal({
  tag,
  otherTags,
  onClose,
  onDeleted,
}: TagDeleteModalProps) {
  const requiresMove = tag.assignmentCount > 0;
  const [moveTo, setMoveTo] = useState<string>(otherTags[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!requiresMove) return true;
    return moveTo.length > 0 && otherTags.length > 0;
  }, [requiresMove, moveTo, otherTags.length]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const body = requiresMove ? { moveTo } : {};
      const res = await fetch(`/api/system/task-tags/${tag.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!res.ok) {
        throw new Error(payload.message ?? `HTTP ${res.status}`);
      }
      onDeleted(tag.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`「#${tag.name}」を削除`}>
      <div className="space-y-3">
        {requiresMove ? (
          <>
            <p className="text-sm text-gray-700">
              このタグには <strong>{tag.assignmentCount} 件</strong>{' '}
              のタスクが紐づいています。削除する前に、紐づくタスクを別のタグに移動してください。
            </p>
            {otherTags.length === 0 ? (
              <ErrorMessage message="移動先となるタグがありません。先に別のタグを作成してください。" />
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  移動先タグ
                </label>
                <select
                  value={moveTo}
                  onChange={(e) => setMoveTo(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid="admin-tag-delete-move-to"
                >
                  {otherTags.map((t) => (
                    <option key={t.id} value={t.id}>
                      #{t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-700">
            このタグには紐づくタスクがありません。削除してよろしいですか?
          </p>
        )}

        {error && <ErrorMessage message={error} />}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={submit}
            isLoading={submitting}
            disabled={!canSubmit}
            data-testid="admin-tag-delete-submit"
          >
            {requiresMove ? '移動して削除' : '削除'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export const getServerSideProps: GetServerSideProps<TagsPageProps> = async (
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
