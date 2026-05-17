// TodayPlanView「今日やる」セクション 1 番目タスクの「完了」ボタン上ヒント。
//
// 設計 (chimo 2026-05-17):
//   - Portal で document.body 直下 (overflow 影響回避)
//   - 完了ボタンの真上に下向き矢印、初回 1 度のみ表示
//   - × or 完了ボタン押下で dismiss、永続化
import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export const TODAY_PLAN_DONE_HINT_VERSION = 'v1-2026-05-19';

interface Props {
  anchorSelector: string;
  onDismiss: (reason: 'close_button') => void;
}

interface Position {
  centerXPx: number;
  topPx: number;
}

export function TodayPlanDoneHint({ anchorSelector, onDismiss }: Props) {
  const [pos, setPos] = useState<Position | null>(null);

  useEffect(() => {
    void fetch('/api/ai-chat/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'today_plan_done_hint_shown',
        version: TODAY_PLAN_DONE_HINT_VERSION,
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
      data-testid="today-plan-done-hint"
      className="pointer-events-none fixed z-[60]"
      style={{
        top: pos.topPx - 12,
        left: pos.centerXPx,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <div className="today-plan-done-hint-bubble pointer-events-auto relative inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 px-4 py-2 text-xs font-semibold text-white shadow-[0_6px_18px_rgba(79,70,229,0.32)]">
        <span aria-hidden className="text-sm leading-none">✨</span>
        <span className="whitespace-nowrap">完了したらクリック</span>
        <button
          type="button"
          onClick={() => onDismiss('close_button')}
          aria-label="閉じる"
          data-testid="today-plan-done-hint-close"
          className="-mr-1 ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-white/80 transition hover:bg-white/20 hover:text-white"
        >
          ×
        </button>
        {/* 下向き矢印: bubble 下端中央、完了ボタンを指す */}
        <span
          aria-hidden
          className="absolute"
          style={{
            bottom: -6,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '7px solid transparent',
            borderRight: '7px solid transparent',
            borderTop: '8px solid rgb(124 58 237)',
          }}
        />
      </div>
      <style>{`
        .today-plan-done-hint-bubble {
          animation:
            today-plan-done-hint-pop-in 0.55s cubic-bezier(0.16, 1, 0.3, 1) both,
            today-plan-done-hint-breath 2.6s ease-in-out 0.55s infinite;
          transform-origin: 50% calc(100% + 10px);
        }
        @keyframes today-plan-done-hint-pop-in {
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
        @keyframes today-plan-done-hint-breath {
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
