// ヘッダー右の「開発者ノート」 トリガー + dropdown panel。
//
// 設計 (chimo 2026-05-20 リファクタ):
//   - 旧: 全ページ共通の floating widget (左下固定) → 視界の邪魔
//   - 新: nav ヘッダー右にぶら下がる button + 押下で下に panel が開く
//   - 未読 (= localStorage dismissed に含まれない announcement) が 1 つ以上あれば 赤 dot
//   - ✕ で「現在表示中の id」を localStorage に dismiss 登録、 次の未読があればそのまま遷移
//   - ↑/↓ で過去/新規の announcement を辿れる (Linear 風)
//   - 外クリック / Esc で panel が閉じる
//
// SSR / hydration 不一致を避けるため、 localStorage の読み出しは useEffect (client only)。
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import type { AnnouncementDTO } from '@/schemas/announcement';

const DISMISSED_KEY = 'vn:developer-notice:dismissed';

const fetcher = async (
  url: string,
): Promise<{ announcements: AnnouncementDTO[] }> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as { announcements: AnnouncementDTO[] };
};

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
  const { data } = useSWR<{ announcements: AnnouncementDTO[] }>(
    '/api/announcements',
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
  const announcementsList = useMemo(
    () => data?.announcements ?? [],
    [data?.announcements],
  );

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  // dismissed は localStorage 同期。 初期値は空 (SSR 一致のため)、 mount 後に読み込む。
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDismissedIds(readDismissed());
  }, []);

  // panel を開いたとき、 未読の最新を初期表示位置に。 未読がなければ index=0 (= 最新)
  useEffect(() => {
    if (!open) return;
    if (announcementsList.length === 0) return;
    const startIdx = announcementsList.findIndex((a) => !dismissedIds.has(a.id));
    setIndex(startIdx >= 0 ? startIdx : 0);
  }, [open, announcementsList, dismissedIds]);

  // 外クリック + Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // SSR との hydration 一致のため、 announcement 0 件でも trigger 自体は描画する
  // (= 「開発者ノート」 ラベルは常に表示)
  const unreadCount = announcementsList.filter((a) => !dismissedIds.has(a.id)).length;
  const hasUnread = unreadCount > 0;

  const current = announcementsList[index];
  const hasOlder = index < announcementsList.length - 1;
  const hasNewer = index > 0;

  const handleDismiss = () => {
    if (!current) return;
    const next = new Set(dismissedIds);
    next.add(current.id);
    setDismissedIds(next);
    writeDismissed(next);
    // 次の未読があればそこに遷移、 なければ panel を閉じる
    const nextUnread = announcementsList.findIndex((a) => !next.has(a.id));
    if (nextUnread >= 0) {
      setIndex(nextUnread);
    } else {
      setOpen(false);
    }
  };

  return (
    // ヘッダー左側、 「vitanotaとは」 の右に inline 配置 (chimo 2026-05-20)。
    // 未読時のみ右隣に赤ドット。
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="developer-notice-trigger"
        // 「vitanotaとは」 と同じ控えめ trigger スタイル
        className="relative inline-flex items-center gap-1.5 text-[15px] text-slate-300 transition-colors hover:text-white"
      >
        開発者ノート
        {hasUnread && (
          <span
            className="inline-flex h-2 w-2 rounded-full bg-red-500"
            aria-label={`未読 ${unreadCount} 件`}
            data-testid="developer-notice-unread-dot"
          />
        )}
      </button>
      {open && (
        <aside
          className="absolute left-0 top-full z-30 mt-2 w-[22rem] overflow-hidden rounded-vn border border-vn-border bg-vn-surface text-left text-slate-700 shadow-lg"
          role="dialog"
          aria-label="開発者からのお知らせ"
          data-testid="developer-notice-widget"
        >
          {announcementsList.length === 0 || !current ? (
            <div className="px-4 py-6 text-center text-[13px] text-slate-400">
              まだお知らせはありません
            </div>
          ) : (
            <>
              <header className="flex items-center justify-between gap-2 border-b border-vn-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold tracking-wide text-vn-accent">
                    開発者から
                  </span>
                  <span className="text-[11px] text-vn-muted">
                    {current.publishDate}
                  </span>
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
                    onClick={handleDismiss}
                    aria-label="閉じる"
                    className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                    data-testid="developer-notice-close"
                  >
                    ✕
                  </button>
                </div>
              </header>
              <div className="px-3 py-3">
                <h2 className="text-sm font-semibold leading-relaxed text-slate-900">
                  {current.title}
                </h2>
                {current.body.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
                    {current.body.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </aside>
      )}
    </div>
  );
}
