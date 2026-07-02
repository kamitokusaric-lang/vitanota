// ユーザーメニュー: アバター/名前をクリックすると開くドロップダウン
// (プロフィール / ログアウト、 兼務時は「管理画面へ」)。
// 旧 Layout.tsx (トップバー) 内に inline だったものを切り出し、 新しい左サイドバーシェル
// (DashboardSidebarLayout) の「デスクトップ下部 (bar)」と「モバイルトップバー (avatar)」の
// 2 箇所で再利用する (chimo 2026-07-02)。Layout.tsx 側は無傷のまま (他ページ用に温存)。
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { LogOut, UserRound } from 'lucide-react';
import type { VitanotaSession } from '@/shared/types/auth';
import { MyProfileModal } from '@/features/profile/components/MyProfileModal';
import { canUseSystemAdminFeatures } from '@/features/auth/lib/role-helpers';

interface UserMenuProps {
  session: VitanotaSession;
  // avatar: 丸アイコンのみ (モバイルトップバー)。 bar: アバター + 名前 + ロールの横長行 (サイドバー下部)。
  variant: 'avatar' | 'bar';
}

// roles から表示用のロール名を一つ選ぶ (サイドバー下部のサブラベル用)。
function roleLabel(roles: VitanotaSession['user']['roles']): string {
  if (roles.includes('system_admin')) return '運営';
  if (roles.includes('school_admin')) return '管理者';
  return '先生';
}

export function UserMenu({ session, variant }: UserMenuProps) {
  const { name, roles } = session.user;
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 外側クリック・ESC で閉じる (旧 Layout.tsx より移植)。
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

  // 兼務 (teacher/school_admin + system_admin) なら管理画面への切替リンクを出す。
  const canSwitchToAdmin = canUseSystemAdminFeatures(roles);
  const initial = name?.trim().charAt(0) ?? '';

  // ドロップダウン本体 (両 variant 共通)。position だけ variant で変える。
  const dropdown = menuOpen && (
    <div
      role="menu"
      className={`absolute z-[60] min-w-[176px] overflow-hidden rounded-[10px] border border-vn-border bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)] ${
        variant === 'bar'
          ? 'bottom-full left-0 mb-2 w-full'
          : 'right-0 top-full mt-1'
      }`}
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
      {canSwitchToAdmin && (
        <Link
          href="/admin/tenants"
          role="menuitem"
          className="flex w-full items-center gap-2 px-4 py-2 text-left text-[14px] text-slate-700 transition-colors hover:bg-vn-muted-bg"
          data-testid="nav-switch-to-admin"
        >
          <UserRound size={15} aria-hidden className="text-slate-400" />
          管理画面へ
        </Link>
      )}
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
  );

  return (
    <div ref={menuRef} className="relative">
      {variant === 'avatar' ? (
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={name}
          title={name}
          className={`flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-bold transition-colors ${
            menuOpen
              ? 'bg-vn-accent text-white'
              : 'bg-vn-accent/90 text-white hover:bg-vn-accent'
          }`}
          data-testid="nav-username"
        >
          {initial || <UserRound size={18} aria-hidden />}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={name}
          title={name}
          className={`flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors ${
            menuOpen ? 'bg-vn-header-hover' : 'hover:bg-vn-header-hover'
          }`}
          data-testid="nav-username"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-vn-accent text-[15px] font-bold text-white">
            {initial || <UserRound size={18} aria-hidden />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-slate-100">
              {name}
            </span>
            <span className="block truncate text-[12px] text-slate-400">
              {roleLabel(roles)}
            </span>
          </span>
        </button>
      )}

      {dropdown}

      <MyProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
