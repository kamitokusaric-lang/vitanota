// モバイル用の下部タブナビ (xl 未満で固定表示)。
// dashboard の ?tab= を切り替える。PC では上部タブ、モバイルではこのナビで画面遷移する
// (Vitanota スマホ版 design・chimo 2026-06-25)。
import { useRouter } from 'next/router';
import type { ReactNode } from 'react';

export interface BottomTab {
  id: string;
  label: string;
  icon: ReactNode;
}

export function BottomTabNav({
  tabs,
  activeId,
  queryParam = 'tab',
}: {
  tabs: BottomTab[];
  activeId: string;
  queryParam?: string;
}) {
  const router = useRouter();
  const go = (id: string) => {
    if (id === activeId) return;
    router.push(
      { pathname: router.pathname, query: { ...router.query, [queryParam]: id } },
      undefined,
      { shallow: true },
    );
  };
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-vn-border bg-vn-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur xl:hidden"
      role="tablist"
      aria-label="メインナビゲーション"
      data-testid="bottom-tab-nav"
    >
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => go(t.id)}
            role="tab"
            aria-selected={active}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
              active ? 'text-vn-accent' : 'text-slate-400 hover:text-slate-600'
            }`}
            data-testid={`bottom-tab-${t.id}`}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
