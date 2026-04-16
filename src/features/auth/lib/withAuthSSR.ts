import type { GetServerSideProps, GetServerSidePropsContext, GetServerSidePropsResult } from 'next';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from './auth-options';
import type { VitanotaSession, Role } from '@/shared/types/auth';

interface WithAuthSSROptions<P extends Record<string, unknown>> {
  requireRole?: Role;
  inner?: (
    ctx: GetServerSidePropsContext,
    session: VitanotaSession
  ) => Promise<GetServerSidePropsResult<P>>;
}

export function withAuthSSR<P extends Record<string, unknown> = Record<string, never>>(
  options?: WithAuthSSROptions<P>
): GetServerSideProps<P & { session: VitanotaSession }> {
  return async (ctx) => {
    const authOptions = await getAuthOptions();
    const session = (await getServerSession(ctx.req, ctx.res, authOptions)) as VitanotaSession | null;

    if (!session) {
      return { redirect: { destination: '/auth/signin', permanent: false } };
    }

    if (session.user.roles.includes('system_admin') && !session.user.tenantId) {
      return { redirect: { destination: '/admin/tenants', permanent: false } };
    }

    if (!session.user.tenantId) {
      return {
        redirect: {
          destination: '/auth/signin?error=NoTenantContext',
          permanent: false,
        },
      };
    }

    if (session.user.tenantStatus === 'suspended') {
      return { redirect: { destination: '/auth/signin?error=TenantSuspended', permanent: false } };
    }

    if (options?.requireRole && !session.user.roles.includes(options.requireRole)) {
      return { notFound: true };
    }

    if (options?.inner) {
      const result = await options.inner(ctx, session);
      if ('props' in result) {
        const props = await result.props;
        return { props: { ...props, session } as P & { session: VitanotaSession } };
      }
      return result;
    }

    return { props: { session } as P & { session: VitanotaSession } };
  };
}
