import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Layout } from '@/shared/components/Layout';
import type { VitanotaSession } from '@/shared/types/auth';

vi.mock('next/router', () => ({
  useRouter: () => ({ push: vi.fn(), pathname: '/' }),
}));

// MyProfileModal は /api/me/profile を fetch するが、モーダル未開のときは fetch しない想定。
// 開いた時の SWR fetch は後続 test で mock

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

  it('no center nav links (全リンク削除済み)', () => {
    render(
      <Layout session={baseSession}>
        <div />
      </Layout>
    );
    expect(screen.queryByTestId('nav-journal-link')).toBeNull();
    expect(screen.queryByTestId('nav-teacher-link')).toBeNull();
    expect(screen.queryByTestId('nav-admin-link')).toBeNull();
    expect(screen.queryByTestId('nav-alerts-link')).toBeNull();
  });

  it('username button opens profile modal on click', () => {
    render(
      <Layout session={baseSession}>
        <div />
      </Layout>
    );
    // モーダル未開 時点
    expect(screen.queryByTestId('modal-content')).toBeNull();
    fireEvent.click(screen.getByTestId('nav-username'));
    // モーダルが開く
    expect(screen.getByTestId('modal-content')).toBeInTheDocument();
  });

  it('teacher にはフィードバック FAB が表示される', () => {
    render(
      <Layout session={baseSession}>
        <div />
      </Layout>
    );
    expect(screen.getByTestId('feedback-fab')).toBeInTheDocument();
  });

  it('school_admin にもフィードバック FAB が表示される', () => {
    const adminSession: VitanotaSession = {
      ...baseSession,
      user: { ...baseSession.user, roles: ['school_admin'] },
    };
    render(
      <Layout session={adminSession}>
        <div />
      </Layout>
    );
    expect(screen.getByTestId('feedback-fab')).toBeInTheDocument();
  });

  it('system_admin にはフィードバック FAB を表示しない (運営側のため)', () => {
    const sysadminSession: VitanotaSession = {
      ...baseSession,
      user: { ...baseSession.user, roles: ['system_admin'], tenantId: null, tenantStatus: null },
    };
    render(
      <Layout session={sysadminSession}>
        <div />
      </Layout>
    );
    expect(screen.queryByTestId('feedback-fab')).toBeNull();
  });
});
