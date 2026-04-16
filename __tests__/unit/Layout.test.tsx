import { describe, it, expect } from 'vitest';
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

  it('hides view switcher for single role user', () => {
    render(
      <Layout session={baseSession}>
        <div />
      </Layout>
    );
    expect(screen.queryByTestId('nav-teacher-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-admin-link')).not.toBeInTheDocument();
  });
});
