// PlanResultModal「今日やる」セクション 1 番目カードの 3 ボタン
// (余裕があれば / 今日やらない / 完了にする) を **右から** 指す 3 つの吹き出し。
//
// 設計 (chimo 2026-05-17):
//   - Portal で document.body 直下に render (Modal の overflow-x clip 回避)
//   - anchor (= 3 ボタン親 div) の getBoundingClientRect を取得して fixed 配置
//   - scroll/resize で座標追従
//   - × は最後 bubble にのみ、1 回の dismiss で 3 つ一括非表示
//   - いずれかのボタン押下でも親側で dismiss (cta_click)
import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export const PLAN_RESULT_BUTTONS_HINT_VERSION = 'v1-2026-05-19';

interface Props {
  // 3 ボタン親 div の CSS セレクタ (例: `[data-testid="plan-result-buttons-<task_id>"]`)
  anchorSelector: string;
  onDismiss: (reason: 'close_button') => void;
}

// ボタン h-8 (32px) + gap 6px の縦並び。各ボタン中央の Y オフセット (anchor top 基準)。
const HINTS = [
  { centerYOffset: 16, text: '今日厳しいときはこっち' },
  { centerYOffset: 54, text: '今日のプランからは外す' },
  { centerYOffset: 92, text: 'もう終わってたらここ' },
];

interface Position {
  leftPx: number; // anchor 右端 (viewport 左端からの px)
  topPx: number; // anchor 上端 (viewport 上端からの px)
}

export function PlanResultButtonsHint({ anchorSelector, onDismiss }: Props) {
  const [pos, setPos] = useState<Position | null>(null);

  useEffect(() => {
    void fetch('/api/ai-chat/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'plan_result_buttons_hint_shown',
        version: PLAN_RESULT_BUTTONS_HINT_VERSION,
      }),
    }).catch(() => undefined);
  }, []);

  // anchor 要素の位置を取得 + 追従
  useLayoutEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 10;

    function update() {
      if (cancelled) return;
      const el = document.querySelector(anchorSelector);
      if (el instanceof HTMLElement) {
        const rect = el.getBoundingClientRect();
        setPos({ leftPx: rect.right, topPx: rect.top });
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
    <>
      {HINTS.map((h, i) => {
        const isLast = i === HINTS.length - 1;
        return (
          <div
            key={i}
            role="status"
            data-testid={`plan-result-buttons-hint-${i + 1}`}
            className="pointer-events-none fixed z-[60]"
            style={{
              top: pos.topPx + h.centerYOffset,
              left: pos.leftPx + 12,
              transform: 'translateY(-50%)',
            }}
          >
            <div className="plan-result-buttons-hint-bubble pointer-events-auto relative inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_6px_18px_rgba(79,70,229,0.32)]">
              <span aria-hidden className="text-xs leading-none">✨</span>
              <span className="whitespace-nowrap">{h.text}</span>
              {isLast && (
                <button
                  type="button"
                  onClick={() => onDismiss('close_button')}
                  aria-label="閉じる"
                  data-testid="plan-result-buttons-hint-close"
                  className="-mr-1 ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-white/80 transition hover:bg-white/20 hover:text-white"
                >
                  ×
                </button>
              )}
              {/* 左向き矢印: bubble 左側面に 2px 食い込ませて密着させる */}
              <span
                aria-hidden
                className="absolute"
                style={{
                  top: '50%',
                  left: -6,
                  transform: 'translateY(-50%)',
                  width: 0,
                  height: 0,
                  borderTop: '7px solid transparent',
                  borderBottom: '7px solid transparent',
                  borderRight: '8px solid rgb(124 58 237)',
                }}
              />
            </div>
          </div>
        );
      })}
      <style>{`
        .plan-result-buttons-hint-bubble {
          animation:
            plan-result-buttons-hint-pop-in 0.55s cubic-bezier(0.16, 1, 0.3, 1) both,
            plan-result-buttons-hint-breath 2.6s ease-in-out 0.55s infinite;
          transform-origin: -10px 50%;
        }
        @keyframes plan-result-buttons-hint-pop-in {
          0% {
            opacity: 0;
            transform: translateX(-8px) scale(0.82);
          }
          55% {
            opacity: 1;
            transform: translateX(3px) scale(1.06);
          }
          100% {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
        @keyframes plan-result-buttons-hint-breath {
          0%,
          100% {
            transform: translateX(0) scale(1);
          }
          50% {
            transform: translateX(2px) scale(1.02);
          }
        }
      `}</style>
    </>,
    document.body,
  );
}
