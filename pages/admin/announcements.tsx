// system_admin: 開発者からのお知らせ管理画面
// 全テナント共通、CRUD (新規 / 編集 / 削除)、publish_date 降順表示
import { useState, useEffect, useCallback } from 'react';
import type { GetServerSideProps } from 'next';
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
import type { AnnouncementDTO } from '@/schemas/announcement';

interface AnnouncementsPageProps {
  session: VitanotaSession;
}

interface EditState {
  kind: 'closed' | 'create' | 'edit' | 'delete';
  announcement?: AnnouncementDTO;
}

export default function AnnouncementsPage({ session }: AnnouncementsPageProps) {
  const [announcements, setAnnouncements] = useState<AnnouncementDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>({ kind: 'closed' });
  const { showToast } = useToast();

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/system/announcements');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { announcements: AnnouncementDTO[] };
      setAnnouncements(data.announcements);
    } catch (_e) {
      setLoadError('お知らせ一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAnnouncements();
  }, [fetchAnnouncements]);

  const openCreate = () => setEdit({ kind: 'create' });
  const openEdit = (a: AnnouncementDTO) =>
    setEdit({ kind: 'edit', announcement: a });
  const openDelete = (a: AnnouncementDTO) =>
    setEdit({ kind: 'delete', announcement: a });
  const closeModal = () => setEdit({ kind: 'closed' });

  const handleCreated = (a: AnnouncementDTO) => {
    setAnnouncements((prev) =>
      [a, ...prev].sort((x, y) => y.publishDate.localeCompare(x.publishDate)),
    );
    closeModal();
    showToast('お知らせを作成しました', 'success');
  };

  const handleUpdated = (a: AnnouncementDTO) => {
    setAnnouncements((prev) =>
      prev
        .map((x) => (x.id === a.id ? a : x))
        .sort((x, y) => y.publishDate.localeCompare(x.publishDate)),
    );
    closeModal();
    showToast('お知らせを更新しました', 'success');
  };

  const handleDeleted = (id: string) => {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    closeModal();
    showToast('お知らせを削除しました', 'success');
  };

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="system_admin">
        <AdminLayout session={session}>
          <div className="p-8">
            <div className="mx-auto max-w-5xl">
              <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">
                  お知らせ管理
                </h1>
                <Button
                  type="button"
                  onClick={openCreate}
                  data-testid="admin-announcements-new-button"
                >
                  + 新規追加
                </Button>
              </div>

              <p className="mb-4 text-sm text-gray-600">
                全テナントの教員に表示されるお知らせ。publish_date 降順で
                ダッシュボード左下の widget に表示されます。
              </p>

              {loading && <LoadingSpinner />}
              {loadError && <ErrorMessage message={loadError} />}
              {!loading && announcements.length === 0 && !loadError && (
                <p className="text-sm text-gray-500">
                  お知らせがありません。
                </p>
              )}

              {!loading && announcements.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table
                    className="min-w-full divide-y divide-gray-200"
                    data-testid="admin-announcements-table"
                  >
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                          公開日
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                          タイトル
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                          本文行数
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {announcements.map((a) => (
                        <tr key={a.id} data-testid={`admin-announcement-row-${a.id}`}>
                          <td className="px-4 py-2 text-sm text-gray-700">
                            {a.publishDate}
                          </td>
                          <td className="max-w-xl truncate px-4 py-2 text-sm text-gray-900">
                            {a.title}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-700">
                            {a.body.length}
                          </td>
                          <td className="px-4 py-2 text-right text-sm">
                            <button
                              type="button"
                              onClick={() => openEdit(a)}
                              className="mr-2 text-blue-600 hover:underline"
                              data-testid={`admin-announcement-edit-${a.id}`}
                            >
                              編集
                            </button>
                            <button
                              type="button"
                              onClick={() => openDelete(a)}
                              className="text-red-600 hover:underline"
                              data-testid={`admin-announcement-delete-${a.id}`}
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
                <AnnouncementFormModal
                  mode={edit.kind}
                  initial={edit.announcement}
                  onClose={closeModal}
                  onCreated={handleCreated}
                  onUpdated={handleUpdated}
                />
              )}

              {edit.kind === 'delete' && edit.announcement && (
                <AnnouncementDeleteModal
                  announcement={edit.announcement}
                  onClose={closeModal}
                  onDeleted={handleDeleted}
                />
              )}
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

interface AnnouncementFormModalProps {
  mode: 'create' | 'edit';
  initial?: AnnouncementDTO;
  onClose: () => void;
  onCreated: (a: AnnouncementDTO) => void;
  onUpdated: (a: AnnouncementDTO) => void;
}

function todayYmd(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function AnnouncementFormModal({
  mode,
  initial,
  onClose,
  onCreated,
  onUpdated,
}: AnnouncementFormModalProps) {
  const [publishDate, setPublishDate] = useState<string>(
    initial?.publishDate ?? todayYmd(),
  );
  const [title, setTitle] = useState<string>(initial?.title ?? '');
  // body は string[]、UI 上は 1 行 = 1 項目の textarea (改行で split)
  const [bodyText, setBodyText] = useState<string>(
    initial ? initial.body.join('\n') : '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const body = bodyText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (mode === 'create') {
        const res = await fetch('/api/system/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publishDate,
            title: title.trim(),
            body,
          }),
        });
        const payload = (await res.json().catch(() => ({}))) as {
          announcement?: AnnouncementDTO;
          message?: string;
        };
        if (!res.ok) throw new Error(payload.message ?? `HTTP ${res.status}`);
        if (payload.announcement) onCreated(payload.announcement);
      } else if (mode === 'edit' && initial) {
        const res = await fetch(`/api/system/announcements/${initial.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publishDate,
            title: title.trim(),
            body,
          }),
        });
        const payload = (await res.json().catch(() => ({}))) as {
          announcement?: AnnouncementDTO;
          message?: string;
        };
        if (!res.ok) throw new Error(payload.message ?? `HTTP ${res.status}`);
        if (payload.announcement) onUpdated(payload.announcement);
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
      title={mode === 'create' ? 'お知らせ新規追加' : 'お知らせ編集'}
    >
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            公開日 (YYYY-MM-DD)
          </label>
          <input
            type="date"
            value={publishDate}
            onChange={(e) => setPublishDate(e.target.value)}
            className="mt-1 w-48 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            data-testid="admin-announcement-form-publish-date"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            タイトル
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={500}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            data-testid="admin-announcement-form-title"
          />
          <p className="mt-0.5 text-xs text-gray-400">{title.length} / 500</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            本文 (1 行 1 項目、空行はスキップ)
          </label>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={6}
            placeholder={'例:\n機能 A を追加しました。\n不具合 B を修正しました。'}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            data-testid="admin-announcement-form-body"
          />
          <p className="mt-0.5 text-xs text-gray-400">
            タイトルだけで body 空でも OK
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
            disabled={title.trim().length === 0 || publishDate.length === 0}
            data-testid="admin-announcement-form-submit"
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

interface AnnouncementDeleteModalProps {
  announcement: AnnouncementDTO;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

function AnnouncementDeleteModal({
  announcement,
  onClose,
  onDeleted,
}: AnnouncementDeleteModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/system/announcements/${announcement.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onDeleted(announcement.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="お知らせを削除">
      <div className="space-y-3">
        <p className="text-sm text-gray-700">
          <strong>{announcement.publishDate}</strong>: {announcement.title}
        </p>
        <p className="text-sm text-gray-600">
          このお知らせを削除します。教員には即時に見えなくなります。
        </p>

        {error && <ErrorMessage message={error} />}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={submit}
            isLoading={submitting}
            data-testid="admin-announcement-delete-submit"
          >
            削除
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export const getServerSideProps: GetServerSideProps<AnnouncementsPageProps> = async (
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
