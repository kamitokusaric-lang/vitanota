// system_admin: タスクカテゴリ管理画面
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

interface CategoryRow {
  id: string;
  name: string;
  isSystemDefault: boolean;
  sortOrder: number;
  createdAt: string;
  taskCount: number;
}

interface CategoriesPageProps {
  session: VitanotaSession;
}

interface EditState {
  kind: 'closed' | 'create' | 'edit' | 'delete';
  category?: CategoryRow;
}

export default function CategoriesPage({ session }: CategoriesPageProps) {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantsError, setTenantsError] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
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
        // URL 経由のテナント指定 or デフォルトで先頭
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

  // カテゴリ一覧取得
  const fetchCategories = useCallback(async (tenantId: string) => {
    if (!tenantId) return;
    setCategoriesLoading(true);
    setCategoriesError(null);
    try {
      const res = await fetch(`/api/system/categories?tenantId=${tenantId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { categories: CategoryRow[] };
      setCategories(data.categories);
    } catch (e) {
      setCategoriesError('カテゴリ一覧の取得に失敗しました');
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTenantId) {
      void fetchCategories(selectedTenantId);
    }
  }, [selectedTenantId, fetchCategories]);

  const handleTenantChange = (id: string) => {
    setSelectedTenantId(id);
    void router.replace(
      { pathname: router.pathname, query: { tenantId: id } },
      undefined,
      { shallow: true },
    );
  };

  const openCreate = () => setEdit({ kind: 'create' });
  const openEdit = (c: CategoryRow) => setEdit({ kind: 'edit', category: c });
  const openDelete = (c: CategoryRow) => setEdit({ kind: 'delete', category: c });
  const closeModal = () => setEdit({ kind: 'closed' });

  const handleCreated = (newCategory: CategoryRow) => {
    setCategories((prev) =>
      [...prev, newCategory].sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.createdAt.localeCompare(b.createdAt),
      ),
    );
    closeModal();
    showToast('カテゴリを作成しました', 'success');
  };

  const handleUpdated = (updated: CategoryRow) => {
    setCategories((prev) =>
      prev
        .map((c) => (c.id === updated.id ? { ...c, ...updated, taskCount: c.taskCount } : c))
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder ||
            a.createdAt.localeCompare(b.createdAt),
        ),
    );
    closeModal();
    showToast('カテゴリを更新しました', 'success');
  };

  const handleDeleted = (deletedId: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== deletedId));
    closeModal();
    showToast('カテゴリを削除しました', 'success');
  };

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="system_admin">
        <AdminLayout session={session}>
          <div className="p-8">
            <div className="mx-auto max-w-6xl">
              <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">
                  カテゴリ管理
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
            data-testid="admin-categories-tenant-select"
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
            data-testid="admin-categories-new-button"
          >
            + 新規追加
          </Button>
        </div>

        {/* カテゴリ一覧 */}
        {categoriesLoading && <LoadingSpinner />}
        {categoriesError && <ErrorMessage message={categoriesError} />}
        {!categoriesLoading && categories.length === 0 && !categoriesError && (
          <p className="text-sm text-gray-500">
            このテナントにはカテゴリがありません。
          </p>
        )}
        {!categoriesLoading && categories.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table
              className="min-w-full divide-y divide-gray-200"
              data-testid="admin-categories-table"
            >
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    名前
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    システム
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    表示順
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
                {categories.map((c) => (
                  <tr key={c.id} data-testid={`admin-category-row-${c.id}`}>
                    <td className="px-4 py-2 text-sm text-gray-900">{c.name}</td>
                    <td className="px-4 py-2 text-sm">
                      {c.isSystemDefault ? (
                        <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                          システム
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      {c.sortOrder}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      {c.taskCount} 件
                    </td>
                    <td className="px-4 py-2 text-right text-sm">
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="mr-2 text-blue-600 hover:underline"
                        data-testid={`admin-category-edit-${c.id}`}
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => openDelete(c)}
                        className="text-red-600 hover:underline"
                        data-testid={`admin-category-delete-${c.id}`}
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

        {/* 新規 / 編集モーダル */}
        {(edit.kind === 'create' || edit.kind === 'edit') && (
          <CategoryFormModal
            mode={edit.kind}
            tenantId={selectedTenantId}
            initial={edit.category}
            onClose={closeModal}
            onCreated={handleCreated}
            onUpdated={handleUpdated}
          />
        )}

                {/* 削除モーダル */}
                {edit.kind === 'delete' && edit.category && (
                  <CategoryDeleteModal
                    category={edit.category}
                    otherCategories={categories.filter(
                      (c) => c.id !== edit.category!.id,
                    )}
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

interface CategoryFormModalProps {
  mode: 'create' | 'edit';
  tenantId: string;
  initial?: CategoryRow;
  onClose: () => void;
  onCreated: (c: CategoryRow) => void;
  onUpdated: (c: CategoryRow) => void;
}

function CategoryFormModal({
  mode,
  tenantId,
  initial,
  onClose,
  onCreated,
  onUpdated,
}: CategoryFormModalProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [sortOrder, setSortOrder] = useState<number>(initial?.sortOrder ?? 0);
  const [isSystemDefault, setIsSystemDefault] = useState<boolean>(
    initial?.isSystemDefault ?? false,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'create') {
        const res = await fetch('/api/system/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId,
            name: name.trim(),
            sortOrder,
            isSystemDefault,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          category?: CategoryRow;
          message?: string;
        };
        if (!res.ok) {
          throw new Error(body.message ?? `HTTP ${res.status}`);
        }
        if (body.category) {
          onCreated({ ...body.category, taskCount: 0 });
        }
      } else if (mode === 'edit' && initial) {
        const res = await fetch(`/api/system/categories/${initial.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            sortOrder,
            isSystemDefault,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          category?: CategoryRow;
          message?: string;
        };
        if (!res.ok) {
          throw new Error(body.message ?? `HTTP ${res.status}`);
        }
        if (body.category) {
          onUpdated({ ...body.category, taskCount: initial.taskCount });
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
      title={mode === 'create' ? 'カテゴリ新規追加' : 'カテゴリ編集'}
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
            maxLength={50}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            data-testid="admin-category-form-name"
          />
          <p className="mt-0.5 text-xs text-gray-400">{name.length} / 50</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            表示順 (数値、小さい順)
          </label>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            min={0}
            className="mt-1 w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            data-testid="admin-category-form-sort-order"
          />
        </div>

        <div>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={isSystemDefault}
              onChange={(e) => setIsSystemDefault(e.target.checked)}
              data-testid="admin-category-form-is-system-default"
            />
            <span className="text-sm text-gray-700">
              システムデフォルトとして扱う
            </span>
          </label>
          <p className="mt-0.5 text-xs text-gray-400">
            初期表示順序や 新規テナント作成時の自動シード対象になります
          </p>
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
            data-testid="admin-category-form-submit"
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

interface CategoryDeleteModalProps {
  category: CategoryRow;
  otherCategories: CategoryRow[];
  onClose: () => void;
  onDeleted: (id: string) => void;
}

function CategoryDeleteModal({
  category,
  otherCategories,
  onClose,
  onDeleted,
}: CategoryDeleteModalProps) {
  const requiresMove = category.taskCount > 0;
  const [moveTo, setMoveTo] = useState<string>(otherCategories[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!requiresMove) return true;
    return moveTo.length > 0 && otherCategories.length > 0;
  }, [requiresMove, moveTo, otherCategories.length]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const body = requiresMove ? { moveTo } : {};
      const res = await fetch(`/api/system/categories/${category.id}`, {
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
      onDeleted(category.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`「${category.name}」を削除`}>
      <div className="space-y-3">
        {requiresMove ? (
          <>
            <p className="text-sm text-gray-700">
              このカテゴリには <strong>{category.taskCount} 件</strong>{' '}
              のタスクが紐づいています。削除する前に、紐づくタスクを別のカテゴリに移動してください。
            </p>
            {otherCategories.length === 0 ? (
              <ErrorMessage message="移動先となるカテゴリがありません。先に別のカテゴリを作成してください。" />
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  移動先カテゴリ
                </label>
                <select
                  value={moveTo}
                  onChange={(e) => setMoveTo(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid="admin-category-delete-move-to"
                >
                  {otherCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-700">
            このカテゴリには紐づくタスクがありません。削除してよろしいですか?
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
            data-testid="admin-category-delete-submit"
          >
            {requiresMove ? '移動して削除' : '削除'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export const getServerSideProps: GetServerSideProps<CategoriesPageProps> = async (
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

  // RoleGuard で system_admin 限定
  return {
    props: {
      session: {
        ...session,
        user: { ...session.user },
      },
    },
  };
};

