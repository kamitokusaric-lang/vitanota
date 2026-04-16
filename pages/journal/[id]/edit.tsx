// /journal/[id]/edit - エントリ編集ページ（US-T-011/012）
import { useRouter } from 'next/router';
import { useSWRConfig } from 'swr';
import useSWR from 'swr';
import { withAuthSSR } from '@/features/auth/lib/withAuthSSR';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import { Button } from '@/shared/components/Button';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { EntryForm } from '@/features/journal/components/EntryForm';
import type { VitanotaSession } from '@/shared/types/auth';
import type { JournalEntry } from '@/db/schema';

interface EditJournalPageProps {
  session: VitanotaSession;
  entryId: string;
}

interface EntryDetailResponse {
  entry: JournalEntry & { tags?: Array<{ id: string }> };
}

const fetcher = async (url: string): Promise<EntryDetailResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export default function EditJournalPage({
  session,
  entryId,
}: EditJournalPageProps) {
  const router = useRouter();
  const { mutate } = useSWRConfig();

  const { data, error, isLoading } = useSWR(
    `/api/private/journal/entries/${entryId}`,
    fetcher
  );

  const handleSuccess = async () => {
    await mutate(
      (key) =>
        typeof key === 'string' &&
        (key.startsWith('/api/public/journal/entries') ||
          key.startsWith('/api/private/journal/entries/mine'))
    );
    router.push('/journal/mine');
  };

  const handleDelete = async () => {
    if (!confirm('このエントリを削除しますか？ この操作は取り消せません。')) {
      return;
    }
    const res = await fetch(`/api/private/journal/entries/${entryId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      alert('削除に失敗しました');
      return;
    }
    await handleSuccess();
  };

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="teacher">
        <Layout session={session}>
          <div className="py-6">
            <header className="mb-6 flex items-center justify-between">
              <h1
                className="text-xl font-bold text-gray-900"
                data-testid="edit-journal-heading"
              >
                記録の編集
              </h1>
              {data && (
                <Button
                  variant="danger"
                  onClick={handleDelete}
                  className="text-xs"
                  data-testid="edit-journal-delete-button"
                >
                  削除
                </Button>
              )}
            </header>

            {isLoading && (
              <div className="py-10 text-center">
                <LoadingSpinner label="読み込み中" />
              </div>
            )}

            {error && (
              <ErrorMessage message="エントリの取得に失敗しました" />
            )}

            {data && (
              <div className="rounded-lg border border-gray-200 bg-white p-6">
                <EntryForm
                  mode="edit"
                  initialData={{
                    id: data.entry.id,
                    content: data.entry.content,
                    tagIds: data.entry.tags?.map((t) => t.id) ?? [],
                    isPublic: data.entry.isPublic,
                  }}
                  onSuccess={handleSuccess}
                  onCancel={() => router.back()}
                />
              </div>
            )}
          </div>
        </Layout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps = withAuthSSR<{ entryId: string }>({
  requireRole: 'teacher',
  inner: async (ctx) => {
    const id = ctx.params?.id;
    if (typeof id !== 'string') {
      return { notFound: true as const };
    }
    return { props: { entryId: id } };
  },
});
