// ダッシュボード等で使う汎用タブコンポーネント
// URL クエリ (?tab=xxx) で状態永続化、リロード・ブックマーク復元可
// disabled タブは「準備中」表示に使える
import { useRouter } from 'next/router';
import type { ReactNode } from 'react';

export interface TabDef {
  id: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
  icon?: ReactNode; // pill: ラベル左 / underline: sm 以上はラベル左・モバイルはラベル上に表示
  badge?: ReactNode; // ラベル右に表示する任意のバッジ (例: New)
  // 上部 tablist には出さないが content は持つ (例: 職員室ノートは PC では右レーン、
  // モバイルでは下部ナビから開く独立タブ・chimo 2026-06-25)。
  hideInTabList?: boolean;
}

interface TabsProps {
  tabs: TabDef[];
  defaultTabId?: string;
  queryParam?: string;
  variant?: 'underline' | 'pill';
  // tablist 右隣に並べる任意の slot (calendar の filter UI 等)
  rightSlot?: ReactNode;
  // タブが実際に切り替わったとき (disabled / 同一タブ再選択を除く) に呼ぶ。
  // 利用計測用 (calendar の view 切替計測など)。
  onSelect?: (id: string) => void;
  // モバイル (xl 未満) では上部 tablist を隠す (下部タブナビで遷移・chimo 2026-06-25)。
  hideTabListOnMobile?: boolean;
  // 上部 tablist を全サイズで描画しない (パネルのみ)。ナビを外側 (左サイドバー + 下部ナビ) が
  // 担う /dashboard 用。?tab= 駆動は不変・chimo 2026-07-02。
  hideTabList?: boolean;
}

export function Tabs({
  tabs,
  defaultTabId,
  queryParam = 'tab',
  variant = 'underline',
  rightSlot,
  onSelect,
  hideTabListOnMobile = false,
  hideTabList = false,
}: TabsProps) {
  const router = useRouter();
  const queryValue = router.query[queryParam];
  const queryTab = typeof queryValue === 'string' ? queryValue : undefined;

  const active =
    tabs.find((t) => t.id === queryTab && !t.disabled)?.id ??
    defaultTabId ??
    tabs.find((t) => !t.disabled)?.id ??
    tabs[0]?.id;

  const handleSelect = (id: string) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab || tab.disabled) return;
    if (id === active) return; // 同一タブ再選択は切替ではない
    router.push(
      {
        pathname: router.pathname,
        query: { ...router.query, [queryParam]: id },
      },
      undefined,
      { shallow: true },
    );
    onSelect?.(id);
  };

  // underline variant: dashboard 大タブ等。 pill variant (chimo 2026-05-30): icon 付きの
  // Linear 風 segmented control。 calendar の board / カレンダー切替で使用。
  const tablistClass =
    variant === 'pill'
      ? 'mb-5 inline-flex items-center gap-1 rounded-lg bg-slate-200 p-1'
      : hideTabListOnMobile
        ? 'mb-5 hidden border-b border-vn-border xl:flex xl:justify-start xl:gap-8'
        : 'mb-5 flex justify-between gap-2 border-b border-vn-border lg:justify-start lg:gap-8';

  const wrapClass = rightSlot
    ? 'mb-5 flex flex-wrap items-center justify-between gap-3'
    : '';

  return (
    <div data-testid="tabs">
      {!hideTabList && (
      <div className={wrapClass}>
      <div role="tablist" className={rightSlot ? tablistClass.replace('mb-5 ', '') : tablistClass}>
        {tabs.map((tab) => {
          if (tab.hideInTabList) return null;
          const isActive = tab.id === active;
          const buttonClass =
            variant === 'pill'
              ? [
                  'relative inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[14px] transition-colors',
                  tab.disabled
                    ? 'cursor-not-allowed font-medium text-slate-300'
                    : isActive
                      ? // active は淡コーラル面 + コーラル枠 + コーラル文字 (ring で枠を描き layout ずれを防ぐ)、
                        // 非アクティブはグレー文字 (chimo 2026-07-02)
                        'bg-vn-accent-bg font-semibold text-vn-accent-text shadow-sm ring-1 ring-inset ring-vn-accent/40'
                      : 'font-medium text-slate-500 hover:text-slate-700',
                ].join(' ')
              : [
                  // 中間幅まで: アイコン上 + 小さいラベル下の縦並び。 lg 以上: 横並び大きめ。
                  // 横並びを lg に上げたのは、 中間幅で横並びにするとラベルが語中折り返しして
                  // 窮屈になるため (chimo 2026-06-15)。 whitespace-nowrap で語中折り返しも禁止。
                  'flex flex-col items-center gap-0.5 whitespace-nowrap pb-2.5 text-[11px] leading-tight transition-colors lg:flex-row lg:gap-1.5 lg:pb-3.5 lg:text-[17px]',
                  tab.disabled
                    ? 'cursor-not-allowed font-semibold text-slate-300'
                    : isActive
                      ? 'border-b-[3px] border-vn-accent font-bold text-vn-accent -mb-px'
                      : 'border-b-[3px] border-transparent font-semibold text-slate-500 hover:text-slate-700',
                ].join(' ');
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              disabled={tab.disabled}
              onClick={() => handleSelect(tab.id)}
              data-testid={`tab-${tab.id}`}
              className={buttonClass}
            >
              {tab.icon}
              {tab.label}
              {tab.badge}
              {tab.disabled && (
                <span className="ml-1 text-xs text-slate-400">(準備中)</span>
              )}
            </button>
          );
        })}
      </div>
        {rightSlot && <div className="flex flex-wrap items-center gap-2.5">{rightSlot}</div>}
      </div>
      )}

      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`tabpanel-${tab.id}`}
          role="tabpanel"
          hidden={tab.id !== active}
          className={tab.id === active ? 'mt-6' : ''}
          data-testid={`tabpanel-${tab.id}`}
        >
          {tab.id === active && tab.content}
        </div>
      ))}
    </div>
  );
}
