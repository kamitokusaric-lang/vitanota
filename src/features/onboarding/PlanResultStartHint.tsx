// PlanResultModal「このタスクで今日の仕事を始める」CTA を指すヒント。
//
// 設計 (chimo 2026-05-17):
//   - Portal で document.body 直下 (Modal の overflow-x clip 回避)
//   - anchor (= 「今日の仕事を始める」ボタン) の getBoundingClientRect で fixed 配置
//   - ボタンの **下** に上向き矢印で指す (modal title 領域との干渉回避)
//   - × ボタン or CTA 押下で dismiss、永続化
import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export const PLAN_RESULT_START_HINT_VERSION = 'v1-2026-05-19';

interface Props {
  anchorSelector: string;
  onDismiss: (reason: 'close_button') => void;
}

interface Position {
  centerXPx: number; // anchor の中央 X (viewport 左端からの px)
  topPx: number; // anchor の上端 (viewport 上端からの px)
}

export function PlanResultStartHint({ anchorSelector, onDismiss }: Props) {
  const [pos, setPos] = useState<Position | null>(null);

  useEffect(() => {
    void fetch('/api/ai-chat/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'plan_result_start_hint_shown',
        version: PLAN_RESULT_START_HINT_VERSION,
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
      data-testid="plan-result-start-hint"
      className="pointer-events-none fixed z-[60]"
      style={{
        top: pos.topPx - 12,
        left: pos.centerXPx,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <div className="plan-result-start-hint-bubble pointer-events-auto relative inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 px-4 py-2 text-xs font-semibold text-white shadow-[0_6px_18px_rgba(79,70,229,0.32)]">
        <span aria-hidden className="text-sm leading-none">✨</span>
        <span className="whitespace-nowrap">今日のタスク予定ができたらクリック</span>
        <button
          type="button"
          onClick={() => onDismiss('close_button')}
          aria-label="閉じる"
          data-testid="plan-result-start-hint-close"
          className="-mr-1 ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-white/80 transition hover:bg-white/20 hover:text-white"
        >
          ×
        </button>
        {/* 下向き矢印: bubble 下端中央、CTA を上から指す (bubble に 2px 食い込み) */}
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
        .plan-result-start-hint-bubble {
          animation:
            plan-result-start-hint-pop-in 0.55s cubic-bezier(0.16, 1, 0.3, 1) both,
            plan-result-start-hint-breath 2.6s ease-in-out 0.55s infinite;
          /* 下向き矢印で下を指すので transform-origin は bubble 下側 */
          transform-origin: 50% calc(100% + 10px);
        }
        @keyframes plan-result-start-hint-pop-in {
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
        @keyframes plan-result-start-hint-breath {
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
