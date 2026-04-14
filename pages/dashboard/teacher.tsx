// Unit-02 で実装するプレースホルダー
import type { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import type { VitanotaSession } from '@/shared/types/auth';

interface TeacherDashboardProps {
  session: VitanotaSession;
}

export default function TeacherDashboard({ session }: TeacherDashboardProps) {
  return (
    <TenantGuard session={session}>
      <RoleGuard
        session={session}
        requiredRole="teacher"
        fallback={
          <div className="py-20 text-center text-gray-500">アクセス権限がありません</div>
        }
      >
        <Layout session={session}>
          <div className="py-10 text-center text-gray-500" data-testid="teacher-dashboard-placeholder">
            教員ダッシュボード（Unit-02 で実装）
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
