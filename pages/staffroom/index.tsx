// /staffroom - 学年会 (クラス状況を持ち寄る同期 Orient の場)
// 2026-08-07: 職員室ボード (生徒の様子 / 情報共有) を撤去し、学年会に置き換えた。
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
  todayDate: string; // JST の今日 (YYYY-MM-DD・学年会の開催日に使う)
}

export default function StaffroomPage({ session, todayDate }: StaffroomPageProps) {
  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="teacher">
        <Layout session={session}>
          <div>
            <h1 className="mb-1 text-xl font-bold text-slate-800">学年会</h1>
            <p className="mb-4 text-sm text-gray-500">
              クラスの状況を持ち寄って、見えている事実と見立てを混ぜる。
            </p>
            <StaffroomBoard todayDate={todayDate} />
          </div>
        </Layout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps = withAuthSSR<{ todayDate: string }>({
  requireRole: 'teacher',
  inner: async () => ({
    props: {
      // JST の今日。サーバ TZ が UTC でもズレないよう明示 (dashboard と同じ計算)。
      todayDate: new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo',
      }).format(new Date()),
    },
  }),
});
