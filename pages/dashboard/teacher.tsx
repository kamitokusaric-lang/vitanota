// Unit-02: 教員ダッシュボード → /journal タイムラインへリダイレクト
import type { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';

export default function TeacherDashboard() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }

  // Unit-02 リリース後は /journal が教員のトップ画面
  return { redirect: { destination: '/journal', permanent: false } };
};
