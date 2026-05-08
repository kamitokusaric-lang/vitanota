// 全ページ共通の左下 floating widget「開発者から」
// - 上↑ で 1 つ古いお知らせ / 下↓ で 1 つ新しいお知らせ (Linear 風)
// - ✕ で「現在表示中の id」を localStorage に dismiss 登録 → widget 非表示
//   次回ロード時、未 dismiss の最新お知らせがあれば再び表示される
// - SSR / hydration 不一致を避けるため、初期化は useEffect (client only) で行う
import { useEffect, useState } from 'react';
import { getAnnouncementsSorted } from '@/features/dashboard/lib/announcements';

const DISMISSED_KEY = 'vn:developer-notice:dismissed';

// announcements は静的データなので module スコープで 1 度だけ整列する。
// useEffect 内で参照しても依存配列に渡せて毎 render の再実行を防げる。
const SORTED_ANNOUNCEMENTS = getAnnouncementsSorted();

function readDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage が使えない場合 (private mode 等) は静かに諦める
  }
}

export function DeveloperNoticeWidget() {
  // visible=false のあいだは widget 自体描画しない (SSR は常に非表示)
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0); // 0 = 最新

  useEffect(() => {
    if (SORTED_ANNOUNCEMENTS.length === 0) return;
    const dismissed = readDismissed();
    // 未 dismiss の最新を初期表示位置にする。全部 dismiss 済みなら出さない。
    const startIdx = SORTED_ANNOUNCEMENTS.findIndex((a) => !dismissed.has(a.id));
    if (startIdx === -1) return;
    setIndex(startIdx);
    setVisible(true);
  }, []);

  if (!visible || SORTED_ANNOUNCEMENTS.length === 0) return null;

  const current = SORTED_ANNOUNCEMENTS[index];
  const hasOlder = index < SORTED_ANNOUNCEMENTS.length - 1;
  const hasNewer = index > 0;

  const handleClose = () => {
    const dismissed = readDismissed();
    dismissed.add(current.id);
    writeDismissed(dismissed);
    setVisible(false);
  };

  return (
    <aside
      className="fixed bottom-6 left-6 z-30 w-[min(22rem,calc(100vw-3rem))] rounded-vn border border-vn-border bg-vn-surface shadow-lg"
      data-testid="developer-notice-widget"
      aria-label="開発者からのお知らせ"
    >
      <header className="flex items-center justify-between gap-2 border-b border-vn-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tracking-wide text-vn-accent">
            開発者から
          </span>
          <span className="text-[11px] text-vn-muted">{current.date}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => hasOlder && setIndex((i) => i + 1)}
            disabled={!hasOlder}
            aria-label="古いお知らせ"
            className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            data-testid="developer-notice-prev"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => hasNewer && setIndex((i) => i - 1)}
            disabled={!hasNewer}
            aria-label="新しいお知らせ"
            className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            data-testid="developer-notice-next"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={handleClose}
            aria-label="閉じる"
            className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            data-testid="developer-notice-close"
          >
            ✕
          </button>
        </div>
      </header>
      <div className="px-3 py-3">
        <h2 className="text-sm font-semibold leading-relaxed text-[#111]">
          {current.title}
        </h2>
        {current.body.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-gray-700">
            {current.body.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
