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
    <div className="min-h-screen bg-vn-bg text-slate-900">
      <nav className="fixed inset-x-0 top-0 z-10 bg-vn-header">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-6 lg:px-14">
          {/* 左: ロゴ + vitanotaとは */}
          <div className="flex items-center gap-5">
            <Link
              href="/"
              className="text-[26px] font-extrabold tracking-tight text-slate-50"
              data-testid="nav-logo"
            >
              vita<span className="text-vn-accent">nota</span>
              <span className="text-vn-accent">.</span>
            </Link>
            {/* chimo 2026-06-15: 「vitanotaとは」は一旦非表示 (あとで使うのでコメントアウトのみ)。
                state / モーダル / import は復活しやすいよう残置。 */}
            {/* <button
              type="button"
              onClick={() => setAboutOpen(true)}
              className="text-[15px] text-slate-300 transition-colors hover:text-white"
              data-testid="nav-about"
            >
              vitanotaとは
            </button> */}
          </div>

          {/* 右: 管理画面リンク (兼務時) + ユーザー名 (プロフィール) + ログアウト */}
          <div className="flex items-center gap-3 text-[14px]">
            {canSwitchToAdmin && (
              <Link
                href="/admin/tenants"
                className="inline-flex h-9 items-center rounded-[9px] border border-slate-600 px-4 text-[14px] text-slate-200 transition-colors hover:border-slate-400 hover:text-white"
                data-testid="nav-switch-to-admin"
              >
                管理画面へ
              </Link>
            )}
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="text-slate-300 transition-colors hover:text-white"
              data-testid="nav-username"
            >
              {name}
            </button>
            <button
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              data-testid="nav-signout-button"
              className="inline-flex h-9 items-center rounded-[9px] border border-slate-600 px-4 text-[14px] text-slate-200 transition-colors hover:border-slate-400 hover:text-white"
            >
              ログアウト
            </button>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-[1440px] px-6 pb-16 pt-[104px] lg:px-14">
        {children}
      </main>

      <MyProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <AboutVitanotaModal open={aboutOpen} onClose={() => setAboutOpen(false)} />

      {showFeedbackFab && <FeedbackFAB />}
    </div>
  );
}
