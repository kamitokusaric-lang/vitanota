import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import { LogOut, UserRound } from 'lucide-react';
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
  // 名前クリックで開くユーザーメニュー (プロフィール / ログアウト)。外側クリック・ESC で閉じる。
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);
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

          {/* 右: 管理画面リンク (兼務時) + ユーザー名クリックで開くメニュー (プロフィール / ログアウト) */}
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
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={name}
                title={name}
                className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                  menuOpen
                    ? 'border-vn-accent bg-vn-accent/15 text-vn-accent'
                    : 'border-vn-accent/60 text-vn-accent hover:border-vn-accent hover:bg-vn-accent/10'
                }`}
                data-testid="nav-username"
              >
                <UserRound size={18} aria-hidden />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-[60] mt-1 min-w-[176px] overflow-hidden rounded-[10px] border border-vn-border bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
                  data-testid="nav-user-menu"
                >
                  <div
                    className="truncate border-b border-vn-border px-4 py-2 text-[13px] font-semibold text-slate-700"
                    data-testid="nav-user-name"
                  >
                    {name}
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProfileOpen(true);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-[14px] text-slate-700 transition-colors hover:bg-vn-muted-bg"
                    data-testid="nav-profile"
                  >
                    <UserRound size={15} aria-hidden className="text-slate-400" />
                    プロフィール
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-[14px] text-slate-700 transition-colors hover:bg-vn-muted-bg"
                    data-testid="nav-signout-button"
                  >
                    <LogOut size={15} aria-hidden className="text-slate-400" />
                    ログアウト
                  </button>
                </div>
              )}
            </div>
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
