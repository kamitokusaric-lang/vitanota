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
    <div className="min-h-screen bg-gray-50">
      <nav className="fixed inset-x-0 top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* 左: ロゴ */}
          <Link
            href="/"
            className="text-lg font-bold text-blue-600"
            data-testid="nav-logo"
          >
            vitanota
          </Link>

          {/* 中央: ナビゲーションリンク */}
          <div className="flex gap-4 text-sm">
            {isTeacher && (
              <>
                <Link
                  href="/journal"
                  className="text-gray-600 hover:text-blue-600"
                  data-testid="nav-journal-link"
                >
                  タイムライン
                </Link>
                <Link
                  href="/dashboard/teacher"
                  className="text-gray-600 hover:text-blue-600"
                  data-testid="nav-teacher-link"
                >
                  感情傾向
                </Link>
              </>
            )}
            {hasMultipleViews && (
              <Link
                href="/dashboard/admin"
                className="text-gray-600 hover:text-blue-600"
                data-testid="nav-admin-link"
              >
                管理者ビュー
              </Link>
            )}
          </div>

          {/* 右: ユーザー名 + ログアウト */}
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600" data-testid="nav-username">
              {name}
            </span>
            <Button
              variant="secondary"
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              data-testid="nav-signout-button"
              className="text-xs"
            >
              ログアウト
            </Button>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
