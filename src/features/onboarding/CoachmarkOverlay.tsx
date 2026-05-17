// 汎用コーチマーク overlay。target 要素を querySelector で取得し、その近傍に
// 吹き出しを表示する。背景クリックで dismiss、矢印で target を指す。
//
// 設計憲法 (feedback_design_vocab.md): 「教える」感を出さない。閉じるは正常動作。
// 観測者原則 (feedback_observed_moment_broken.md): dismiss を負シグナル扱いしない。
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';

export interface CoachmarkStep {
  targetSelector: string;
  title?: string;
  body: ReactNode;
  primaryLabel: string; // 「次へ」or「はじめる」(最終ステップ)
}

interface CoachmarkOverlayProps {
  steps: CoachmarkStep[];
  currentStep: number; // 0-indexed
  onAdvance: (nextStep: number) => void; // 次へ押下
  onComplete: () => void; // 最終ステップで「はじめる」押下
  onDismiss: (reason: 'skip' | 'outside_click') => void;
}

interface Position {
  top: number;
  left: number;
  arrowDirection: 'up' | 'down';
}

const BUBBLE_WIDTH = 320;
const BUBBLE_GAP = 12; // target との隙間
const VIEWPORT_PADDING = 8;

function computePosition(rect: DOMRect): Position {
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;

  // target の下に置けるか?
  const spaceBelow = viewportH - rect.bottom;
  const placeBelow = spaceBelow >= 200;

  const top = placeBelow
    ? rect.bottom + BUBBLE_GAP + window.scrollY
    : rect.top - BUBBLE_GAP + window.scrollY; // 上配置時は bubble 下端を target 上端に合わせるので translateY で調整

  // target の中央に揃えつつ、画面端からはみ出さないように
  const targetCenter = rect.left + rect.width / 2;
  let left = targetCenter - BUBBLE_WIDTH / 2 + window.scrollX;
  const minLeft = VIEWPORT_PADDING + window.scrollX;
  const maxLeft = viewportW - BUBBLE_WIDTH - VIEWPORT_PADDING + window.scrollX;
  if (left < minLeft) left = minLeft;
  if (left > maxLeft) left = maxLeft;

  return {
    top,
    left,
    arrowDirection: placeBelow ? 'up' : 'down',
  };
}

export function CoachmarkOverlay({
  steps,
  currentStep,
  onAdvance,
  onComplete,
  onDismiss,
}: CoachmarkOverlayProps) {
  const step = steps[currentStep];
  const [position, setPosition] = useState<Position | null>(null);
  const [targetReady, setTargetReady] = useState(false);

  // target 要素を取得 (mount 直後に DOM が間に合わないことがあるので最大 5 回 retry)
  useLayoutEffect(() => {
    if (!step) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 5;

    function tryFind() {
      if (cancelled) return;
      const el = document.querySelector(step.targetSelector);
      if (el instanceof HTMLElement) {
        setPosition(computePosition(el.getBoundingClientRect()));
        setTargetReady(true);
        return;
      }
      attempts++;
      if (attempts < maxAttempts) {
        requestAnimationFrame(tryFind);
      } else {
        // target が見つからない場合は表示しない (silent skip)
        setTargetReady(false);
      }
    }

    setTargetReady(false);
    tryFind();
    return () => {
      cancelled = true;
    };
  }, [step]);

  // resize / scroll で位置追従
  useEffect(() => {
    if (!step || !targetReady) return;
    function update() {
      const el = document.querySelector(step.targetSelector);
      if (el instanceof HTMLElement) {
        setPosition(computePosition(el.getBoundingClientRect()));
      }
    }
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step, targetReady]);

  if (!step || !targetReady || !position) return null;

  const isLast = currentStep === steps.length - 1;
  const handlePrimary = () => {
    if (isLast) {
      onComplete();
    } else {
      onAdvance(currentStep + 1);
    }
  };

  const arrowStyle: React.CSSProperties =
    position.arrowDirection === 'up'
      ? {
          top: -8,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderBottom: '8px solid white',
        }
      : {
          bottom: -8,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: '8px solid white',
        };

  // 上配置のときは bubble 自体を target の上に出すため translateY(-100%)
  const bubbleStyle: React.CSSProperties = {
    position: 'absolute',
    top: position.top,
    left: position.left,
    width: BUBBLE_WIDTH,
    transform: position.arrowDirection === 'down' ? 'translateY(-100%)' : undefined,
  };

  return (
    <>
      {/* 背景 dim layer (クリックで dismiss) */}
      <div
        data-testid="coachmark-overlay-backdrop"
        onClick={() => onDismiss('outside_click')}
        className="fixed inset-0 z-40 bg-slate-900/30"
        aria-hidden
      />
      {/* 吹き出し */}
      <div
        role="dialog"
        aria-label={step.title ?? 'コーチマーク'}
        data-testid={`coachmark-step-${currentStep + 1}`}
        className="z-50 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
        style={bubbleStyle}
      >
        {/* 矢印 */}
        <span
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2"
          style={{ ...arrowStyle, width: 0, height: 0 }}
        />
        {step.title && (
          <p className="mb-2 text-sm font-semibold text-slate-700">{step.title}</p>
        )}
        <div className="text-sm leading-relaxed text-slate-700">{step.body}</div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {currentStep + 1} / {steps.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDismiss('skip')}
              data-testid="coachmark-close"
              className="rounded-md px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
            >
              閉じる
            </button>
            <button
              type="button"
              onClick={handlePrimary}
              data-testid="coachmark-primary"
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-indigo-700"
            >
              {step.primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
