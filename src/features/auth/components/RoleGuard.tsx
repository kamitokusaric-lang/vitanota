// SP-04 Layer 4: ロール検証
// 注意: フロントエンドのみに依存しない。API レベルでも必ず同様のロールチェックを行う
import type { VitanotaSession, Role } from '@/shared/types/auth';

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
  if (!session.user.roles.includes(requiredRole)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
