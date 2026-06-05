// FeedbackFAB の未読 dot の **上** に出すぽわわーんヒント。
//
// 設計 (chimo 2026-05-17, F3):
//   - Portal で document.body 直下 (右下固定 FAB は overflow 影響なし、整合性のため)
//   - anchor (= FAB ボタン) の getBoundingClientRect で fixed 配置、真上に下向き矢印
//   - × or FAB クリック (= 教員が dot に気づいてモーダル開いた) で dismiss、永続化
//   - 一度 dismiss されたら次回未読が来ても再表示しない (= dot だけで学習済み)
import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export const FEEDBACK_UNREAD_HINT_VERSION = 'v1-2026-05-19';

interface Props {
  anchorSelector: string;
  onDismiss: (reason: 'close_button') => void;
}

interface Position {
  centerXPx: number;
  topPx: number;
}

export function FeedbackUnreadHint({ anchorSelector, onDismiss }: Props) {
  const [pos, setPos] = useState<Position | null>(null);

  useEffect(() => {
    void fetch('/api/ai-chat/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'feedback_unread_hint_shown',
        version: FEEDBACK_UNREAD_HINT_VERSION,
      }),
    }).catch(() => undefined);
  }, []);

  useLayoutEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 10;

    function update() {
      if (cancelled) return false;
      const el = document.querySelector(anchorSelector);
      if (el instanceof HTMLElement) {
        const rect = el.getBoundingClientRect();
        setPos({
          centerXPx: rect.left + rect.width / 2,
          topPx: rect.top,
        });
        return true;
      }
      return false;
    }

    function tryFind() {
      if (cancelled) return;
      if (update()) return;
      attempts++;
      if (attempts < maxAttempts) {
        requestAnimationFrame(tryFind);
      }
    }
    tryFind();

    const onScrollOrResize = () => {
      update();
    };
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [anchorSelector]);

  if (!pos || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="status"
      data-testid="feedback-unread-hint"
      className="pointer-events-none fixed z-[60]"
      style={{
        // FAB は画面右下端、bubble を中央揃えだと右端が見切れる。
        // bubble 右端を FAB の中央付近に揃える形 (= bubble は左に伸びる)
        top: pos.topPx - 12,
        left: pos.centerXPx + 14,
        transform: 'translate(-100%, -100%)',
      }}
    >
      <div className="feedback-unread-hint-bubble pointer-events-auto relative inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 px-4 py-2 text-xs font-semibold text-white shadow-[0_6px_18px_rgba(22,163,74,0.36)]">
        <span aria-hidden className="text-sm leading-none">📩</span>
        <span className="whitespace-nowrap">返信が届きました</span>
        <button
          type="button"
          onClick={() => onDismiss('close_button')}
          aria-label="閉じる"
          data-testid="feedback-unread-hint-close"
          className="-mr-1 ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-white/80 transition hover:bg-white/20 hover:text-white"
        >
          ×
        </button>
        {/* 下向き矢印: bubble 右下、FAB 中央を斜め下に指す */}
        <span
          aria-hidden
          className="absolute"
          style={{
            bottom: -6,
            right: 14,
            width: 0,
            height: 0,
            borderLeft: '7px solid transparent',
            borderRight: '7px solid transparent',
            borderTop: '8px solid rgb(22 163 74)',
          }}
        />
      </div>
      <style>{`
        .feedback-unread-hint-bubble {
          animation:
            feedback-unread-hint-pop-in 0.55s cubic-bezier(0.16, 1, 0.3, 1) both,
            feedback-unread-hint-breath 2.6s ease-in-out 0.55s infinite;
          /* 右寄せ配置 + 矢印は bubble 右下なので、transform-origin も右下寄せ */
          transform-origin: calc(100% - 14px) calc(100% + 10px);
        }
        @keyframes feedback-unread-hint-pop-in {
          0% {
            opacity: 0;
            transform: translateY(8px) scale(0.82);
          }
          55% {
            opacity: 1;
            transform: translateY(-3px) scale(1.06);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes feedback-unread-hint-breath {
          0%,
          100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-2px) scale(1.02);
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
