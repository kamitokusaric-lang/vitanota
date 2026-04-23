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
}

interface TabsProps {
  tabs: TabDef[];
  defaultTabId?: string;
  queryParam?: string;
}

export function Tabs({ tabs, defaultTabId, queryParam = 'tab' }: TabsProps) {
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
    router.push(
      {
        pathname: router.pathname,
        query: { ...router.query, [queryParam]: id },
      },
      undefined,
      { shallow: true },
    );
  };

  return (
    <div data-testid="tabs">
      <div
        role="tablist"
        className="flex gap-1 border-b border-gray-200"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === active;
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
              className={[
                'px-4 py-2 text-sm font-medium transition-colors',
                tab.disabled
                  ? 'cursor-not-allowed text-gray-300'
                  : isActive
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {tab.label}
              {tab.disabled && (
                <span className="ml-1 text-xs text-gray-400">(準備中)</span>
              )}
            </button>
          );
        })}
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
