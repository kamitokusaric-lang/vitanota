import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleGuard } from '@/features/auth/components/RoleGuard';
import type { VitanotaSession } from '@/shared/types/auth';

const makeSession = (roles: string[]): VitanotaSession => ({
  user: {
    userId: 'user-1',
    email: 'test@school.jp',
    name: 'テスト ユーザー',
    image: null,
    tenantId: 'tenant-1',
    roles: roles as any,
    tenantStatus: 'active',
  },
  expires: new Date(Date.now() + 86_400_000).toISOString(),
});

describe('RoleGuard', () => {
  it('必要なロールを持つ場合、children を表示する', () => {
    const session = makeSession(['teacher']);
    render(
      <RoleGuard session={session} requiredRole="teacher">
        <div data-testid="protected-content">保護コンテンツ</div>
      </RoleGuard>
    );
    expect(screen.getByTestId('protected-content')).toBeTruthy();
  });

  it('必要なロールがない場合、デフォルトで null を返す', () => {
    const session = makeSession(['teacher']);
    const { container } = render(
      <RoleGuard session={session} requiredRole="school_admin">
        <div data-testid="protected-content">保護コンテンツ</div>
      </RoleGuard>
    );
    expect(screen.queryByTestId('protected-content')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it('必要なロールがなく fallback が指定されている場合、fallback を表示する', () => {
    const session = makeSession(['teacher']);
    render(
      <RoleGuard
        session={session}
        requiredRole="school_admin"
        fallback={<div data-testid="fallback-content">アクセス権限がありません</div>}
      >
        <div data-testid="protected-content">保護コンテンツ</div>
      </RoleGuard>
    );
    expect(screen.queryByTestId('protected-content')).toBeNull();
    expect(screen.getByTestId('fallback-content')).toBeTruthy();
  });

  it('複数ロールを持つユーザーは各ロールの保護コンテンツにアクセスできる', () => {
    const session = makeSession(['teacher', 'school_admin']);
    const { rerender } = render(
      <RoleGuard session={session} requiredRole="teacher">
        <div data-testid="teacher-content">教員コンテンツ</div>
      </RoleGuard>
    );
    expect(screen.getByTestId('teacher-content')).toBeTruthy();

    rerender(
      <RoleGuard session={session} requiredRole="school_admin">
        <div data-testid="admin-content">管理者コンテンツ</div>
      </RoleGuard>
    );
    expect(screen.getByTestId('admin-content')).toBeTruthy();
  });
});
