// /dashboard 専用のアプリシェル (chimo 2026-07-02 デザイン刷新)。
//
// 旧構成: 固定トップバー (Layout.tsx) + underline タブ + 右レーン(職員室ノート440px)。
// 新構成: 左サイドバー (ロゴ + ナビ + ユーザー) + メイン1カラム。職員室ノートはメインのタブへ昇格。
//
// - デスクトップ (xl+): fixed 左サイドバー。ナビ項目クリックで ?tab= を shallow 切替。
// - モバイル (<xl): サイドバーは隠し、細いトップバー(ロゴ+ユーザー) + 既存の下部タブナビ(page 側で描画)。
//
// Layout.tsx は他ページ(/staffroom, /admin 等)用に無傷で温存する。ユーザーメニューは
// UserMenu.tsx に切り出して両シェルで共有できる形にした(ここでは bar / avatar の 2 形態で使用)。
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { ReactNode } from 'react';
import type { VitanotaSession } from '@/shared/types/auth';
import { UserMenu } from '@/shared/components/UserMenu';
import { FeedbackFAB } from '@/features/feedback/components/FeedbackFAB';
import { canUseTeacherFeatures } from '@/features/auth/lib/role-helpers';

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: ReactNode;
  // この項目の後に区切り線を引く (グループ境界・chimo 2026-07-02)。
  dividerAfter?: boolean;
}

interface DashboardSidebarLayoutProps {
  session: VitanotaSession;
  navItems: SidebarNavItem[];
  activeId: string;
  queryParam?: string;
  // メイン上部の白ヘッダーバーに出す現在タブのタイトル / 説明 (chimo 2026-07-02)。
  title: string;
  subtitle?: string;
  children: ReactNode;
}

function Logo() {
  return (
    <Link
      href="/"
      className="text-[24px] font-extrabold tracking-tight text-slate-50"
      data-testid="nav-logo"
    >
      vita<span className="text-vn-accent">nota</span>
      <span className="text-vn-accent">.</span>
    </Link>
  );
}

export function DashboardSidebarLayout({
  session,
  navItems,
  activeId,
  queryParam = 'tab',
  title,
  subtitle,
  children,
}: DashboardSidebarLayoutProps) {
  const router = useRouter();
  const go = (id: string) => {
    if (id === activeId) return;
    router.push(
      { pathname: router.pathname, query: { ...router.query, [queryParam]: id } },
      undefined,
      { shallow: true },
    );
  };
  const showFeedbackFab = canUseTeacherFeatures(session.user.roles);

  return (
    <div className="min-h-screen bg-vn-bg text-slate-900">
      {/* デスクトップ: 左サイドバー */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-vn-header xl:flex"
        aria-label="メインナビゲーション"
        data-testid="sidebar-nav"
      >
        <div className="px-6 py-6">
          <Logo />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {navItems.map((item) => {
            const active = item.id === activeId;
            return (
              <div key={item.id}>
                <button
                  type="button"
                  onClick={() => go(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`mb-1 flex w-full items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-[15px] transition-colors ${
                    active
                      ? 'bg-vn-accent font-bold text-white'
                      : 'font-semibold text-slate-300 hover:bg-vn-header-hover hover:text-white'
                  }`}
                  data-testid={`sidebar-nav-${item.id}`}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </button>
                {item.dividerAfter && (
                  <hr className="my-2.5 border-white/10" aria-hidden />
                )}
              </div>
            );
          })}
        </nav>
        {showFeedbackFab && (
          <div className="px-3 pb-1">
            <FeedbackFAB variant="sidebar" />
          </div>
        )}
        <div className="border-t border-white/10 p-3">
          <UserMenu session={session} variant="bar" />
        </div>
      </aside>

      {/* モバイル: 細いトップバー (遷移は下部タブナビ・page 側で描画) */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between bg-vn-header px-4 xl:hidden">
        <Logo />
        <UserMenu session={session} variant="avatar" />
      </header>

      <main className="pt-14 xl:ml-60 xl:pt-0">
        {/* 白ヘッダーバー: 現在タブのタイトル + 説明 (chimo 2026-07-02 キャプチャ準拠) */}
        <div
          className="border-b border-vn-border bg-vn-surface px-5 py-3.5 xl:px-12 xl:py-4"
          data-testid="dashboard-header"
        >
          <h1
            className="text-[18px] font-bold leading-tight text-vn-ink xl:text-[20px]"
            data-testid="dashboard-header-title"
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-[12px] text-vn-ink-sub xl:text-[13px]">
              {subtitle}
            </p>
          )}
        </div>
        <div className="mx-auto max-w-[1440px] px-4 pb-24 pt-0 xl:px-12 xl:pb-12">
          {children}
        </div>
      </main>

      {/* モバイル(<xl)はサイドバーが出ないため、右下 FAB を入口として残す。
          下部タブナビ(BottomTabNav)に隠れないよう持ち上げる。 */}
      {showFeedbackFab && (
        <div className="xl:hidden">
          <FeedbackFAB aboveBottomNav />
        </div>
      )}
    </div>
  );
}
