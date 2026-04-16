export type Operation = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';

export type RlsRule =
  | { role: 'system_admin'; access: 'all' }
  | { role: 'school_admin'; access: 'tenant' }
  | { role: 'school_admin'; access: 'tenant'; ownerColumn: string }
  | { role: 'school_admin'; access: 'tenant_read'; condition: string }
  | { role: 'teacher'; access: 'tenant' }
  | { role: 'teacher'; access: 'tenant'; ownerColumn: string }
  | { role: 'teacher'; access: 'tenant_read'; condition: string }
  | { role: 'bootstrap'; access: 'self_only'; ownerColumn: string };

export interface RlsPolicy {
  table: string;
  policyName: string;
  operation: Operation;
  rules: RlsRule[];
  withCheck?: boolean;
}
