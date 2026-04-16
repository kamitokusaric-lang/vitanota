// /journal/new - 新規エントリ作成ページ（US-T-010）
import { useRouter } from 'next/router';
import { useSWRConfig } from 'swr';
import { withAuthSSR } from '@/features/auth/lib/withAuthSSR';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import { EntryForm } from '@/features/journal/components/EntryForm';
import type { VitanotaSession } from '@/shared/types/auth';

interface NewJournalPageProps {
  session: VitanotaSession;
}

export default function NewJournalPage({ session }: NewJournalPageProps) {
  const router = useRouter();
  const { mutate } = useSWRConfig();

  const handleSuccess = async () => {
    // SWR キャッシュ無効化（共有タイムラインとマイ記録の両方を再取得させる）
    // 注: CloudFront エッジキャッシュは最大 90 秒遅延する（operational-risks R4 の方針）
    await mutate(
      (key) =>
        typeof key === 'string' &&
        (key.startsWith('/api/public/journal/entries') ||
          key.startsWith('/api/private/journal/entries/mine'))
    );
    router.push('/journal/mine');
  };

  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="teacher">
        <Layout session={session}>
          <div className="py-6">
            <header className="mb-6">
              <h1
                className="text-xl font-bold text-gray-900"
                data-testid="new-journal-heading"
              >
                新規投稿
              </h1>
            </header>

            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <EntryForm
                mode="create"
                onSuccess={handleSuccess}
                onCancel={() => router.back()}
              />
            </div>
          </div>
        </Layout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps = withAuthSSR({ requireRole: 'teacher' });
