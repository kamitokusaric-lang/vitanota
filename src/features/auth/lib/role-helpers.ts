// ロール階層ヘルパ
// school_admin は teacher 機能も使える (階層関係)
// system_admin はテナントに属さない別枠 (tenant 横断管理用)
import type { Role } from '@/shared/types/auth';

// teacher 機能にアクセスできるロール (school_admin も含む)
export function canUseTeacherFeatures(roles: Role[]): boolean {
  return roles.includes('teacher') || roles.includes('school_admin');
}

// 管理者特権 (例: タイムラインのカテゴリフィルタ)
export function canUseAdminFeatures(roles: Role[]): boolean {
  return roles.includes('school_admin');
}

// system_admin 特権 (テナント管理など)
export function canUseSystemAdminFeatures(roles: Role[]): boolean {
  return roles.includes('system_admin');
}

// requiredRole 指定時の階層考慮チェック
// - required="teacher": teacher / school_admin が通る
// - required="school_admin": school_admin のみ
// - required="system_admin": system_admin のみ
export function hasRequiredRole(roles: Role[], required: Role): boolean {
  if (required === 'teacher') return canUseTeacherFeatures(roles);
  if (required === 'school_admin') return canUseAdminFeatures(roles);
  if (required === 'system_admin') return canUseSystemAdminFeatures(roles);
  return false;
}
