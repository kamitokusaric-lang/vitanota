import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Layout } from '@/shared/components/Layout';
import type { VitanotaSession } from '@/shared/types/auth';

vi.mock('next/router', () => ({
  useRouter: () => ({ push: vi.fn(), pathname: '/' }),
}));

const baseSession: VitanotaSession = {
  user: {
    userId: 'u-1',
    email: 'test@example.com',
    name: 'テスト教員',
    image: null,
    tenantId: 't-1',
    roles: ['teacher'],
    tenantStatus: 'active',
  },
  expires: '2099-01-01',
};

describe('Layout', () => {
  it('renders logo and username', () => {
    render(
      <Layout session={baseSession}>
        <div>child content</div>
      </Layout>
    );
    expect(screen.getByTestId('nav-logo')).toHaveTextContent('vitanota');
    expect(screen.getByTestId('nav-username')).toHaveTextContent('テスト教員');
  });

  it('renders children', () => {
    render(
      <Layout session={baseSession}>
        <div data-testid="child">hello</div>
      </Layout>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('shows view switcher when user has multiple roles', () => {
    const multiRoleSession: VitanotaSession = {
      ...baseSession,
      user: { ...baseSession.user, roles: ['teacher', 'school_admin'] },
    };
    render(
      <Layout session={multiRoleSession}>
        <div />
      </Layout>
    );
    expect(screen.getByTestId('nav-teacher-link')).toBeInTheDocument();
    expect(screen.getByTestId('nav-admin-link')).toBeInTheDocument();
  });

  it('shows teacher nav links for single teacher role', () => {
    render(
      <Layout session={baseSession}>
        <div />
      </Layout>
    );
    // Unit-03: 教員は常に「タイムライン」「感情傾向」リンクが表示される
    expect(screen.getByTestId('nav-journal-link')).toBeInTheDocument();
    expect(screen.getByTestId('nav-teacher-link')).toBeInTheDocument();
    // 管理者リンクは非表示
    expect(screen.queryByTestId('nav-admin-link')).not.toBeInTheDocument();
  });
});
