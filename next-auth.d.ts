import type { Role, TenantStatus } from '@/shared/types/auth';

declare module 'next-auth' {
  interface Session {
    user: {
      userId: string;
      email: string;
      name: string;
      image: string | null;
      tenantId: string | null;
      roles: Role[];
      tenantStatus: TenantStatus | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string;
    tenantId: string | null;
    roles: Role[];
    tenantStatus: TenantStatus | null;
  }
}
