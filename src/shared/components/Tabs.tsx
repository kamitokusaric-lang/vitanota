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
  icon?: ReactNode; // pill variant 時にラベル左に表示
  badge?: ReactNode; // ラベル右に表示する任意のバッジ (例: New)
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
}

export function Tabs({
  tabs,
  defaultTabId,
  queryParam = 'tab',
  variant = 'underline',
  rightSlot,
  onSelect,
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
      ? 'mb-5 inline-flex items-center gap-1 rounded-full bg-slate-50 p-1'
      : 'mb-5 flex gap-8 border-b border-vn-border';

  const wrapClass = rightSlot
    ? 'mb-5 flex flex-wrap items-center justify-between gap-3'
    : '';

  return (
    <div data-testid="tabs">
      <div className={wrapClass}>
      <div role="tablist" className={rightSlot ? tablistClass.replace('mb-5 ', '') : tablistClass}>
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          const buttonClass =
            variant === 'pill'
              ? [
                  'relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] transition-colors',
                  tab.disabled
                    ? 'cursor-not-allowed font-medium text-slate-300'
                    : isActive
                      ? 'bg-white font-semibold text-slate-900 shadow-sm'
                      : 'font-medium text-slate-500 hover:text-slate-700',
                ].join(' ')
              : [
                  'pb-3.5 text-[17px] transition-colors',
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
              {variant === 'pill' && tab.icon}
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
