export type Role = 'teacher' | 'school_admin' | 'system_admin';
export type TenantStatus = 'active' | 'suspended';

export interface VitanotaJWT {
  userId: string;
  email: string;
  name: string;
  image: string | null;
  tenantId: string | null;      // null = system_admin
  roles: Role[];
  tenantStatus: TenantStatus | null;  // null = system_admin
  iat: number;
  exp: number;
}

export interface VitanotaSessionUser {
  userId: string;
  email: string;
  name: string;
  image: string | null;
  tenantId: string | null;
  roles: Role[];
  tenantStatus: TenantStatus | null;
}

export interface VitanotaSession {
  user: VitanotaSessionUser;
  expires: string;
}
