// BR-ROLE-03: ロール別リダイレクト
import type { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';

export default function Home() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }

  const { roles } = session.user;

  if (roles.includes('system_admin')) {
    return { redirect: { destination: '/admin/tenants', permanent: false } };
  }

  // teacher / school_admin は共通ダッシュボードへ
  return { redirect: { destination: '/dashboard', permanent: false } };
};
