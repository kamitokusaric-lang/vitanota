import Link from 'next/link';
import { signOut } from 'next-auth/react';
import type { VitanotaSession } from '@/shared/types/auth';
import { Button } from './Button';

interface LayoutProps {
  children: React.ReactNode;
  session: VitanotaSession;
}

export function Layout({ children, session }: LayoutProps) {
  const { roles, name } = session.user;

  const isTeacher = roles.includes('teacher');
  const isSchoolAdmin = roles.includes('school_admin');
  const isSystemAdmin = roles.includes('system_admin');
  const hasMultipleViews = isTeacher && isSchoolAdmin;

  return (
    <div className="min-h-screen bg-vn-bg">
      <nav className="fixed inset-x-0 top-0 z-10 bg-vn-header">
        <div className="mx-auto flex h-16 max-w-[1040px] items-center justify-between px-6 lg:px-10">
          {/* 左: ロゴ */}
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-white"
            data-testid="nav-logo"
          >
            vita<span className="text-vn-accent">nota</span>
            <span className="text-vn-accent">.</span>
          </Link>

          {/* 中央: ナビゲーションリンク */}
          <div className="flex gap-5 text-[13px]">
            {isTeacher && (
              <>
                <Link
                  href="/journal"
                  className="text-gray-400 transition-colors hover:text-white"
                  data-testid="nav-journal-link"
                >
                  タイムライン
                </Link>
                <Link
                  href="/dashboard/teacher"
                  className="text-gray-400 transition-colors hover:text-white"
                  data-testid="nav-teacher-link"
                >
                  感情傾向
                </Link>
              </>
            )}
            {isSchoolAdmin && (
              <>
                <Link
                  href="/dashboard/admin"
                  className="text-gray-400 transition-colors hover:text-white"
                  data-testid="nav-admin-link"
                >
                  ダッシュボード
                </Link>
                <Link
                  href="/dashboard/admin/alerts"
                  className="text-gray-400 transition-colors hover:text-white"
                  data-testid="nav-alerts-link"
                >
                  アラート
                </Link>
              </>
            )}
          </div>

          {/* 右: ユーザー名 + ログアウト */}
          <div className="flex items-center gap-3 text-[13px]">
            <span className="text-gray-400" data-testid="nav-username">
              {name}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              data-testid="nav-signout-button"
              className="rounded-md border border-gray-600 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-400 hover:text-white"
            >
              ログアウト
            </button>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-[1040px] px-6 pt-24 pb-20 lg:px-10">{children}</main>
    </div>
  );
}
