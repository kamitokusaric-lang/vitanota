// /baton-relay - H7 朝のバトンリレー (学校知の循環の入口)
// 朝の出欠まわりで気になる子に印 (ポジティブ/気になる) と一言を残し、次の先生へ渡す。
// モバイルファースト (スマホ縦 1 画面基準)。グローバルシェル刷新は後続スライス。
import { withAuthSSR } from '@/features/auth/lib/withAuthSSR';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import { Layout } from '@/shared/components/Layout';
import { BatonRelayBoard } from '@/features/baton-relay/components/BatonRelayBoard';
import type { VitanotaSession } from '@/shared/types/auth';

interface BatonRelayPageProps {
  session: VitanotaSession;
  todayDate: string;
}

export default function BatonRelayPage({ session, todayDate }: BatonRelayPageProps) {
  return (
    <TenantGuard session={session}>
      <RoleGuard session={session} requiredRole="teacher">
        <Layout session={session}>
          <div className="mx-auto max-w-2xl">
            <h1 className="mb-1 text-xl font-bold text-slate-800">朝のバトン</h1>
            <p className="mb-4 text-sm text-gray-500">
              気になる子に印と一言を残して、次の先生へ渡す。
            </p>
            <BatonRelayBoard currentUserId={session.user.userId} todayDate={todayDate} />
          </div>
        </Layout>
      </RoleGuard>
    </TenantGuard>
  );
}

export const getServerSideProps = withAuthSSR<{ todayDate: string }>({
  requireRole: 'teacher',
  async inner() {
    // JST の今日 (YYYY-MM-DD)。サーバ TZ が UTC でもズレないよう明示。
    const todayDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
    }).format(new Date());
    return { props: { todayDate } };
  },
});
