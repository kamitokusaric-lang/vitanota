// Unit-04 で実装するプレースホルダー
import type { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import type { VitanotaSession } from '@/shared/types/auth';

interface AdminDashboardProps {
  session: VitanotaSession;
}

export default function AdminDashboard({ session }: AdminDashboardProps) {
  return (
    <TenantGuard session={session}>
      <RoleGuard
        session={session}
        requiredRole="school_admin"
        fallback={
          <div className="py-20 text-center text-gray-500">アクセス権限がありません</div>
        }
      >
        <Layout session={session}>
          <div className="py-10 text-center text-gray-500" data-testid="admin-dashboard-placeholder">
            管理者ダッシュボード（Unit-04 で実装）
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
