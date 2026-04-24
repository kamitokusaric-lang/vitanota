// SP-04 Layer 4: ロール検証 (階層考慮: school_admin は teacher 機能も通す)
// 注意: フロントエンドのみに依存しない。API レベルでも必ず同様のロールチェックを行う
import type { VitanotaSession, Role } from '@/shared/types/auth';
import { hasRequiredRole } from '@/features/auth/lib/role-helpers';

interface RoleGuardProps {
  children: React.ReactNode;
  session: VitanotaSession;
  requiredRole: Role;
  fallback?: React.ReactNode;
}

export function RoleGuard({
  children,
  session,
  requiredRole,
  fallback = null,
}: RoleGuardProps) {
  if (!hasRequiredRole(session.user.roles, requiredRole)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
