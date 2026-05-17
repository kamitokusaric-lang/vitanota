// PlanResultModal「このタスクで今日の仕事を始める」CTA を指すヒント。
//
// 設計 (chimo 2026-05-17):
//   - Portal の getBoundingClientRect 計算がズレる事象が出たため、Portal を廃止し
//     親 (CTA ボタンを囲む relative wrapper) の中で absolute 配置する形に変更
//   - CTA ボタンと一緒に sticky bar 追従、座標計算不要
//   - bubble は CTA の真上に下向き矢印で配置
//   - × ボタン or CTA 押下で dismiss、永続化
import { useEffect } from 'react';

export const PLAN_RESULT_START_HINT_VERSION = 'v1-2026-05-19';

interface Props {
  onDismiss: (reason: 'close_button') => void;
}

export function PlanResultStartHint({ onDismiss }: Props) {
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

  return (
    <div
      role="status"
      data-testid="plan-result-start-hint"
      className="pointer-events-none absolute z-[60]"
      style={{
        // 親 (CTA ボタン直上の relative wrapper) の中で、CTA の真上に配置
        bottom: '100%',
        right: 0,
        marginBottom: 12,
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
        {/* 下向き矢印: bubble 右下、CTA ボタン上端を指す (bubble は right:0 で右揃え) */}
        <span
          aria-hidden
          className="absolute"
          style={{
            bottom: -6,
            right: 20,
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
          transform-origin: calc(100% - 20px) calc(100% + 10px);
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
    </div>
  );
}
