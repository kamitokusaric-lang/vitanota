// 機能 B: system_admin 用 トピック CRUD 画面
// 一覧 + 新規追加 / 編集 (モーダル) / 削除 or 無効化 (条件付き)
import { useState, useEffect, useCallback } from 'react';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Modal';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { useToast } from '@/shared/components/Toast';
import type { VitanotaSession } from '@/shared/types/auth';

interface Topic {
  id: string;
  title: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  submissionCount: number;
  createdAt: string;
  updatedAt: string;
}

interface PageProps {
  session: VitanotaSession;
}

interface FormState {
  title: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}

const emptyForm: FormState = {
  title: '',
  description: '',
  sortOrder: 0,
  isActive: true,
};

export default function FeedbackTopicsPage({ session }: PageProps) {
  const { showToast } = useToast();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/system/feedback/topics');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? '取得失敗');
      setTopics(data.topics);
    } catch {
      setError('トピック一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  function openCreateModal() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEditModal(topic: Topic) {
    setEditingId(topic.id);
    setForm({
      title: topic.title,
      description: topic.description ?? '',
      sortOrder: topic.sortOrder,
      isActive: topic.isActive,
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.title.trim().length === 0) return;
    setSubmitting(true);
    try {
      const isEdit = editingId !== null;
      const url = isEdit
        ? `/api/system/feedback/topics/${editingId}`
        : '/api/system/feedback/topics';
      const method = isEdit ? 'PATCH' : 'POST';
      const body = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        sortOrder: form.sortOrder,
        isActive: form.isActive,
      };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? '保存失敗');
      showToast(isEdit ? 'トピックを更新しました' : 'トピックを追加しました', 'success');
      setModalOpen(false);
      await fetchTopics();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '保存に失敗しました';
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(topic: Topic) {
    setBusyId(topic.id);
    try {
      const res = await fetch(`/api/system/feedback/topics/${topic.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !topic.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? '更新失敗');
      showToast(
        topic.isActive ? 'トピックを無効化しました' : 'トピックを有効化しました',
        'success',
      );
      await fetchTopics();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '更新に失敗しました';
      showToast(message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(topic: Topic) {
    if (!window.confirm(`トピック「${topic.title}」を削除します。よろしいですか？`)) return;
    setBusyId(topic.id);
    try {
      const res = await fetch(`/api/system/feedback/topics/${topic.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.status === 409) {
        showToast(
          `投稿があるため削除できません (${data.submissionCount} 件)。無効化に切り替えてください`,
          'error',
        );
        return;
      }
      if (!res.ok) throw new Error(data.message ?? '削除失敗');
      showToast('トピックを削除しました', 'success');
      await fetchTopics();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '削除に失敗しました';
      showToast(message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="system_admin">
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="mx-auto max-w-5xl">
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-2xl font-bold text-gray-800">トピック管理</h1>
              <div className="flex items-center gap-3 text-sm">
                <Link href="/admin/feedback" className="text-blue-600 hover:underline">
                  ← 投稿一覧
                </Link>
                <Button onClick={openCreateModal} data-testid="topic-create-button">
                  + 新規追加
                </Button>
              </div>
            </div>

            {error && (
              <div className="mb-4">
                <ErrorMessage message={error} onRetry={fetchTopics} />
              </div>
            )}

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              {loading ? (
                <div className="flex justify-center py-12">
                  <LoadingSpinner size="lg" label="トピック一覧を読み込み中" />
                </div>
              ) : topics.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-400">
                  まだトピックがありません。「+ 新規追加」から作成してください
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left">タイトル</th>
                      <th className="px-4 py-3 text-left">ヒント文</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">表示順</th>
                      <th className="px-4 py-3 text-center whitespace-nowrap">公開</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">投稿数</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {topics.map((t) => (
                      <tr key={t.id} data-testid={`topic-row-${t.id}`}>
                        <td className="px-4 py-3 font-medium text-gray-800">{t.title}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                          {t.description ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">{t.sortOrder}</td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={[
                              'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                              t.isActive
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-200 text-gray-600',
                            ].join(' ')}
                          >
                            {t.isActive ? '有効' : '無効'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {t.submissionCount}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="secondary"
                              onClick={() => openEditModal(t)}
                              className="text-xs"
                              data-testid={`topic-edit-${t.id}`}
                            >
                              編集
                            </Button>
                            {t.submissionCount === 0 ? (
                              <Button
                                variant="danger"
                                onClick={() => handleDelete(t)}
                                isLoading={busyId === t.id}
                                className="text-xs"
                                data-testid={`topic-delete-${t.id}`}
                              >
                                🗑 削除
                              </Button>
                            ) : (
                              <Button
                                variant="secondary"
                                onClick={() => handleToggleActive(t)}
                                isLoading={busyId === t.id}
                                className="text-xs"
                                data-testid={`topic-toggle-${t.id}`}
                              >
                                {t.isActive ? '無効化' : '有効化'}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingId ? 'トピック編集' : 'トピック新規追加'}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="topic-title" className="mb-1 block text-sm text-gray-700">
                タイトル (必須)
              </label>
              <input
                id="topic-title"
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                maxLength={100}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                data-testid="topic-title-input"
              />
            </div>
            <div>
              <label htmlFor="topic-description" className="mb-1 block text-sm text-gray-700">
                ヒント文 (任意、教員 UI に表示)
              </label>
              <textarea
                id="topic-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                maxLength={1000}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                data-testid="topic-description-input"
              />
            </div>
            <div>
              <label htmlFor="topic-sort-order" className="mb-1 block text-sm text-gray-700">
                表示順 (数値、小さい順に表示)
              </label>
              <input
                id="topic-sort-order"
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm"
                data-testid="topic-sort-order-input"
              />
            </div>
            <fieldset>
              <legend className="mb-1 text-sm text-gray-700">公開状態</legend>
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="topic-is-active"
                    checked={form.isActive}
                    onChange={() => setForm({ ...form, isActive: true })}
                    data-testid="topic-active-on"
                  />
                  有効 (教員に表示)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="topic-is-active"
                    checked={!form.isActive}
                    onChange={() => setForm({ ...form, isActive: false })}
                    data-testid="topic-active-off"
                  />
                  無効 (新規投稿不可、既存投稿は閲覧可)
                </label>
              </div>
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                キャンセル
              </Button>
              <Button type="submit" isLoading={submitting} data-testid="topic-save-button">
                保存
              </Button>
            </div>
          </form>
        </Modal>
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
