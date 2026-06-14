// /staffroom - H7-B 職員室ボード (学校知の循環の出口)
// 朝のバトンで溜まった気づきが、学校知として職員室に返り、反応が生まれる場。
// teacher / school_admin が相互関心層として読み書きする (requireRole='teacher' で両方通る)。
// モバイルファースト。グローバルシェル刷新は後続スライス。
import { withAuthSSR } from '@/features/auth/lib/withAuthSSR';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import { StaffroomBoard } from '@/features/staffroom/components/StaffroomBoard';
import type { VitanotaSession } from '@/shared/types/auth';

interface StaffroomPageProps {
  session: VitanotaSession;
}

export default function StaffroomPage({ session }: StaffroomPageProps) {
  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="teacher">
        <Layout session={session}>
          <div>
            <h1 className="mb-1 text-xl font-bold text-slate-800">職員室ボード</h1>
            <p className="mb-4 text-sm text-gray-500">
              気づきや困りごとを残して、先生どうしで渡しあう。
            </p>
            <StaffroomBoard />
          </div>
        </Layout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps = withAuthSSR({
  requireRole: 'teacher',
});
