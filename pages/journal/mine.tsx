// /journal/mine - マイ記録ページ（自分の公開・非公開エントリ）
import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import { Button } from '@/shared/components/Button';
import { MyJournalList } from '@/features/journal/components/MyJournalList';
import type { VitanotaSession } from '@/shared/types/auth';

interface MyJournalPageProps {
  session: VitanotaSession;
}

export default function MyJournalPage({ session }: MyJournalPageProps) {
  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="teacher">
        <Layout session={session}>
          <div className="py-6">
            <header className="mb-6 flex items-center justify-between">
              <h1
                className="text-xl font-bold text-gray-900"
                data-testid="my-journal-heading"
              >
                マイ記録
              </h1>
              <div className="flex gap-2">
                <Link href="/journal" data-testid="nav-to-timeline-link">
                  <Button variant="secondary" className="text-xs">
                    タイムライン
                  </Button>
                </Link>
                <Link href="/journal/new">
                  <Button className="text-xs">新規投稿</Button>
                </Link>
              </div>
            </header>

            <MyJournalList />
          </div>
        </Layout>
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

  return { props: { session } };
};
