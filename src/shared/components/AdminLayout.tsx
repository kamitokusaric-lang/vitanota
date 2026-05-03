// system_admin (運営) 専用レイアウト
// vitanota ロゴ + ナビゲーション (テナント / 招待 / フィードバック / トピック)
// + サインインユーザー (email) + ログアウト
//
// teacher / school_admin 用の Layout (MyProfileModal や FeedbackFAB を含む) とは
// 役割が違うので分離。/admin/* 配下で使う。
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signOut } from 'next-auth/react';
import type { VitanotaSession } from '@/shared/types/auth';
import { canUseTeacherFeatures } from '@/features/auth/lib/role-helpers';

interface AdminLayoutProps {
  children: React.ReactNode;
  session: VitanotaSession;
}

interface NavItem {
  label: string;
  href: string;
  // active 判定用: pathname がこのプレフィックスに一致 (or 完全一致) の場合
  matchPrefix: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'テナント',     href: '/admin/tenants',          matchPrefix: '/admin/tenants' },
  { label: '招待',         href: '/admin/invitations',      matchPrefix: '/admin/invitations' },
  { label: 'フィードバック', href: '/admin/feedback',        matchPrefix: '/admin/feedback' },
  { label: 'トピック管理',  href: '/admin/feedback/topics', matchPrefix: '/admin/feedback/topics' },
];

export function AdminLayout({ children, session }: AdminLayoutProps) {
  const router = useRouter();
  const { email } = session.user;
  // 兼務 (system_admin + teacher / school_admin) なら教員ダッシュボードへの切替リンクを出す
  const canSwitchToTeacher = canUseTeacherFeatures(session.user.roles);

  // 「フィードバック」と「トピック管理」が両方マッチしないように長い方を優先
  const activePrefix = [...NAV_ITEMS]
    .map((item) => item.matchPrefix)
    .sort((a, b) => b.length - a.length)
    .find((prefix) => router.pathname === prefix || router.pathname.startsWith(prefix + '/'));

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="fixed inset-x-0 top-0 z-10 bg-vn-header">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6 lg:px-10">
          <div className="flex items-center gap-6">
            <Link
              href="/admin/tenants"
              className="text-xl font-bold tracking-tight text-white"
              data-testid="admin-nav-logo"
            >
              vita<span className="text-vn-accent">nota</span>
              <span className="text-vn-accent">.</span>
            </Link>
            <span className="text-[11px] uppercase tracking-wider text-gray-400">
              system admin
            </span>
            <div className="flex items-center gap-1 text-[13px]">
              {NAV_ITEMS.map((item) => {
                const active = item.matchPrefix === activePrefix;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      'rounded-md px-3 py-1.5 transition-colors ' +
                      (active
                        ? 'bg-white/10 text-white'
                        : 'text-gray-400 hover:text-white')
                    }
                    data-testid={`admin-nav-${item.matchPrefix.replace(/\//g, '-').slice(1)}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3 text-[13px]">
            {canSwitchToTeacher && (
              <Link
                href="/dashboard"
                className="rounded-md border border-gray-600 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-400 hover:text-white"
                data-testid="admin-nav-switch-to-dashboard"
              >
                ダッシュボードへ
              </Link>
            )}
            <span className="text-gray-400" data-testid="admin-nav-email">
              {email}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              data-testid="admin-nav-signout-button"
              className="rounded-md border border-gray-600 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-400 hover:text-white"
            >
              ログアウト
            </button>
          </div>
        </div>
      </nav>
      <main className="pt-16">{children}</main>
    </div>
  );
}
