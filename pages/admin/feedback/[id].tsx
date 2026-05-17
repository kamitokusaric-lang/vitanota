// F3: system_admin 用 フィードバック詳細 + 返信投稿画面
// 一覧 (/admin/feedback) で行クリックから遷移。返信は片方向 (運営 → 教員)。
import { useState, useEffect, useCallback } from 'react';
import type { GetServerSideProps } from 'next';
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

interface Submission {
  id: string;
  createdAt: string;
  content: string;
  topicId: string;
  topicTitle: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
}

interface Reply {
  id: string;
  body: string;
  createdAt: string;
  replierUserId: string | null;
}

interface PageProps {
  session: VitanotaSession;
  submissionId: string;
}

const MAX_BODY = 5000;

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function FeedbackDetailPage({ session, submissionId }: PageProps) {
  const { showToast } = useToast();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/system/feedback/submissions/${submissionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? '取得失敗');
      setSubmission(data.submission);
      setReplies(data.replies);
    } catch {
      setError('投稿詳細の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (body.trim().length === 0 || body.length > MAX_BODY) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/system/feedback/submissions/${submissionId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? '送信失敗');
      // 楽観 UI 更新 (replierUserId は API レスポンスにないので null 補完)
      setReplies((prev) => [
        ...prev,
        {
          id: data.reply.id,
          body: data.reply.body,
          createdAt: data.reply.createdAt,
          replierUserId: session.user.userId,
        },
      ]);
      setBody('');
      showToast('返信を投稿しました', 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '送信に失敗しました';
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="system_admin">
        <AdminLayout session={session}>
          <div className="p-8">
            <div className="mx-auto max-w-3xl">
              <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800">投稿詳細</h1>
                <Link href="/admin/feedback" className="text-sm text-blue-600 hover:underline">
                  ← 投稿一覧
                </Link>
              </div>

              {error && (
                <div className="mb-4">
                  <ErrorMessage message={error} onRetry={fetchDetail} />
                </div>
              )}

              {loading ? (
                <div className="flex justify-center py-12">
                  <LoadingSpinner size="lg" label="投稿詳細を読み込み中" />
                </div>
              ) : submission ? (
                <>
                  <div
                    className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
                    data-testid="submission-detail"
                  >
                    <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
                      <dt className="text-gray-500">投稿日時</dt>
                      <dd className="text-gray-700">{formatDateTime(submission.createdAt)}</dd>
                      <dt className="text-gray-500">トピック</dt>
                      <dd className="text-gray-700">{submission.topicTitle}</dd>
                      <dt className="text-gray-500">投稿者</dt>
                      <dd className="text-gray-700">
                        <div>{submission.userName ?? '—'}</div>
                        <div className="text-xs text-gray-400">{submission.userEmail}</div>
                      </dd>
                      <dt className="text-gray-500">テナント</dt>
                      <dd className="text-gray-700">{submission.tenantName}</dd>
                    </dl>
                    <div className="mt-4 whitespace-pre-wrap break-words rounded-md bg-gray-50 p-4 text-sm text-gray-800">
                      {submission.content}
                    </div>
                  </div>

                  <div className="mb-6 rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="border-b border-gray-200 px-6 py-3">
                      <h2 className="text-lg font-semibold text-gray-700">
                        運営からの返信
                        {replies.length > 0 && (
                          <span className="ml-2 text-sm font-normal text-gray-500">
                            ({replies.length} 件)
                          </span>
                        )}
                      </h2>
                    </div>
                    {replies.length === 0 ? (
                      <div className="px-6 py-6 text-sm text-gray-400">まだ返信はありません</div>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {replies.map((r) => (
                          <li key={r.id} className="px-6 py-4" data-testid={`reply-row-${r.id}`}>
                            <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                              <span>運営より</span>
                              <span>{formatDateTime(r.createdAt)}</span>
                            </div>
                            <div className="whitespace-pre-wrap break-words text-sm text-gray-800">
                              {r.body}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <form
                    onSubmit={handleSubmit}
                    className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
                  >
                    <label htmlFor="reply-body" className="mb-2 block text-sm font-medium text-gray-700">
                      返信を投稿 (運営より)
                    </label>
                    <textarea
                      id="reply-body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={6}
                      maxLength={MAX_BODY}
                      placeholder="本文を入力してください"
                      className="w-full rounded-md border border-vn-border px-3 py-2 text-sm focus:border-vn-accent focus:outline-none"
                      data-testid="reply-body-input"
                      required
                    />
                    <div className="mt-1 text-right text-xs text-gray-400">
                      {body.length} / {MAX_BODY}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="submit"
                        isLoading={submitting}
                        disabled={body.trim().length === 0}
                        data-testid="reply-submit"
                      >
                        返信を送信
                      </Button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="px-6 py-8 text-center text-gray-400">投稿が見つかりません</div>
              )}
            </div>
          </div>
        </AdminLayout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (context) => {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }
  if (!session.user.roles.includes('system_admin')) {
    return { redirect: { destination: '/', permanent: false } };
  }
  const id = context.params?.id;
  if (typeof id !== 'string') {
    return { notFound: true };
  }
  return { props: { session, submissionId: id } };
};
