// CapacityModal「ふつう」ボタン真上のヒント吹き出し。
//
// 設計 (chimo 2026-05-17): CapacityModal の離脱対策。3 択どれを選んでよいか
// 迷う教員に「ふつう」を促す。AI prompt の件数振り分けにしか影響しないので、
// 「ふつう」=安全デフォルトとして案内する。
//
// 文言: 「迷ったときは、ふつうを選んでね」
// 永続化: 一度 dismiss (× / いずれかの capacity ボタン押下) で次回以降非表示
// 踏み絵: 選択肢を狭めず、デフォルトの案内のみ。負シグナル扱いしない (info ログ)
import { useEffect } from 'react';

export const CAPACITY_MODAL_DEFAULT_HINT_VERSION = 'v1-2026-05-19';

interface Props {
  onDismiss: (reason: 'close_button') => void;
}

export function CapacityModalHint({ onDismiss }: Props) {
  useEffect(() => {
    void fetch('/api/ai-chat/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'capacity_modal_default_hint_shown',
        version: CAPACITY_MODAL_DEFAULT_HINT_VERSION,
      }),
    }).catch(() => undefined);
  }, []);

  return (
    <div
      role="status"
      data-testid="capacity-modal-default-hint"
      className="pointer-events-none absolute z-10"
      style={{
        // 「ふつう」ボタン内の右寄りに被せて配置 (= 少なめボタンと被らない)。
        // 左向き矢印でボタン中央方向を指す。
        top: '50%',
        right: 8,
        transform: 'translateY(-50%)',
      }}
    >
      <div className="capacity-modal-hint-bubble pointer-events-auto relative inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_22px_rgba(79,70,229,0.32)]">
        <span aria-hidden className="text-sm leading-none">✨</span>
        <span className="whitespace-nowrap">迷ったときは、ふつうを選んでね</span>
        <button
          type="button"
          onClick={() => onDismiss('close_button')}
          aria-label="閉じる"
          data-testid="capacity-modal-default-hint-close"
          className="-mr-1 ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-white/80 transition hover:bg-white/20 hover:text-white"
        >
          ×
        </button>
        {/* 左向き矢印: bubble 左側面、「ふつう」ボタン中央方向を指す */}
        <span
          aria-hidden
          className="absolute"
          style={{
            top: '50%',
            left: -7,
            transform: 'translateY(-50%)',
            width: 0,
            height: 0,
            borderTop: '7px solid transparent',
            borderBottom: '7px solid transparent',
            borderRight: '8px solid rgb(124 58 237)',
          }}
        />
      </div>
      <style jsx>{`
        .capacity-modal-hint-bubble {
          animation:
            capacity-modal-hint-pop-in 0.55s cubic-bezier(0.16, 1, 0.3, 1) both,
            capacity-modal-hint-breath 2.6s ease-in-out 0.55s infinite;
          /* 左向き矢印で左を指すので transform-origin は左側 */
          transform-origin: -10px 50%;
        }
        @keyframes capacity-modal-hint-pop-in {
          0% {
            opacity: 0;
            transform: translateX(-8px) scale(0.85);
          }
          55% {
            opacity: 1;
            transform: translateX(3px) scale(1.05);
          }
          100% {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
        @keyframes capacity-modal-hint-breath {
          0%,
          100% {
            transform: translateX(0) scale(1);
          }
          50% {
            transform: translateX(2px) scale(1.02);
          }
        }
      `}</style>
    </div>
  );
}
