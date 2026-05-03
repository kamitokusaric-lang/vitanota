import Link from 'next/link';
import { useState } from 'react';
import { signOut } from 'next-auth/react';
import type { VitanotaSession } from '@/shared/types/auth';
import { MyProfileModal } from '@/features/profile/components/MyProfileModal';
import { AboutVitanotaModal } from '@/shared/components/AboutVitanotaModal';
import { FeedbackFAB } from '@/features/feedback/components/FeedbackFAB';
import { canUseTeacherFeatures, canUseSystemAdminFeatures } from '@/features/auth/lib/role-helpers';

interface LayoutProps {
  children: React.ReactNode;
  session: VitanotaSession;
}

export function Layout({ children, session }: LayoutProps) {
  const { name } = session.user;
  const [profileOpen, setProfileOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const showFeedbackFab = canUseTeacherFeatures(session.user.roles);
  // 兼務 (teacher/school_admin + system_admin) なら管理画面への切替リンクを出す
  const canSwitchToAdmin = canUseSystemAdminFeatures(session.user.roles);

  return (
    <div className="min-h-screen bg-vn-bg">
      <nav className="fixed inset-x-0 top-0 z-10 bg-vn-header">
        <div className="mx-auto flex h-16 max-w-[1040px] items-center justify-between px-6 lg:px-10">
          {/* 左: ロゴ + vitanotaとは */}
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-xl font-bold tracking-tight text-white"
              data-testid="nav-logo"
            >
              vita<span className="text-vn-accent">nota</span>
              <span className="text-vn-accent">.</span>
            </Link>
            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              className="text-[13px] text-gray-400 transition-colors hover:text-white"
              data-testid="nav-about"
            >
              vitanotaとは
            </button>
          </div>

          {/* 右: 管理画面リンク (兼務時) + ユーザー名 (プロフィール) + ログアウト */}
          <div className="flex items-center gap-3 text-[13px]">
            {canSwitchToAdmin && (
              <Link
                href="/admin/tenants"
                className="rounded-md border border-gray-600 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-400 hover:text-white"
                data-testid="nav-switch-to-admin"
              >
                管理画面へ
              </Link>
            )}
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="text-gray-400 transition-colors hover:text-white"
              data-testid="nav-username"
            >
              {name}
            </button>
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

      <MyProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <AboutVitanotaModal open={aboutOpen} onClose={() => setAboutOpen(false)} />

      {showFeedbackFab && <FeedbackFAB />}
    </div>
  );
}
