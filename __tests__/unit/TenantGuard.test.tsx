import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TenantGuard } from '@/features/auth/components/TenantGuard';
import type { VitanotaSession } from '@/shared/types/auth';

// next/router のモック
const mockPush = vi.fn();
vi.mock('next/router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// next-auth/react のモック
vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
}));

const activeSession: VitanotaSession = {
  user: {
    userId: 'user-1',
    email: 'teacher@school.jp',
    name: '山田 太郎',
    image: null,
    tenantId: 'tenant-1',
    roles: ['teacher'],
    tenantStatus: 'active',
  },
  expires: new Date(Date.now() + 86_400_000).toISOString(),
};

const suspendedSession: VitanotaSession = {
  ...activeSession,
  user: { ...activeSession.user, tenantStatus: 'suspended' },
};

beforeEach(() => {
  mockPush.mockClear();
});

describe('TenantGuard', () => {
  it('セッションがない場合 null を返し /auth/signin へリダイレクトする', () => {
    const { container } = render(
      <TenantGuard session={null}>
        <div data-testid="children">コンテンツ</div>
      </TenantGuard>
    );
    expect(screen.queryByTestId('children')).toBeNull();
    expect(mockPush).toHaveBeenCalledWith('/auth/signin');
    expect(container.firstChild).toBeNull();
  });

  it('テナントが停止中の場合、停止メッセージを表示する', () => {
    render(
      <TenantGuard session={suspendedSession}>
        <div data-testid="children">コンテンツ</div>
      </TenantGuard>
    );
    expect(screen.getByTestId('tenant-suspended-message')).toBeTruthy();
    expect(screen.queryByTestId('children')).toBeNull();
  });

  it('セッションが有効でテナントが active の場合、children を表示する', () => {
    render(
      <TenantGuard session={activeSession}>
        <div data-testid="children">コンテンツ</div>
      </TenantGuard>
    );
    expect(screen.getByTestId('children')).toBeTruthy();
    expect(screen.queryByTestId('tenant-suspended-message')).toBeNull();
  });
});
