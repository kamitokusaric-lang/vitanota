// 「今日の見通しをつくる」CTA カードの上に浮かべる、ぽわわーん吹き出し。
//
// 設計 (chimo 2026-05-16 方針転換):
//   3 ステップ overlay から、各 CTA 個別の小ヒントに転換。第一弾はこのカード。
//   出現 pop-in + 緩い呼吸アニメ。「閉じる」または CTA クリックで dismiss、
//   永続化して次回以降表示しない (押し付け感の排除)。
//
// 設計憲法 (feedback_design_vocab.md): 「整理する」を使う、命令しない。
// 観測者原則: dismiss を負シグナル扱いしない (logger.info のみ)。
import { useEffect } from 'react';

export const MORNING_PLAN_HINT_VERSION = 'v1-2026-05-19';

interface Props {
  onDismiss: (reason: 'close_button') => void;
}

export function MorningPlanHint({ onDismiss }: Props) {
  // mount 時に Shown を fire-and-forget で発火
  useEffect(() => {
    void fetch('/api/ai-chat/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'morning_plan_hint_shown',
        version: MORNING_PLAN_HINT_VERSION,
      }),
    }).catch(() => undefined);
  }, []);

  return (
    <div
      role="status"
      data-testid="morning-plan-hint"
      className="pointer-events-none absolute z-10"
      style={{
        // MorningPlanCard 右側「見通しをつくる」ピル CTA の左隣に水平配置。
        // card 右 padding (px-5 = 20px) + CTA pill (約 132px) + gap (8px) = 160px
        top: '50%',
        right: 160,
        transform: 'translateY(-50%)',
      }}
    >
      <div className="morning-plan-hint-bubble pointer-events-auto relative inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(79,70,229,0.32)]">
        <span aria-hidden className="text-base leading-none">✨</span>
        <span className="whitespace-nowrap">今日やることを整理しましょう</span>
        <button
          type="button"
          onClick={() => onDismiss('close_button')}
          aria-label="閉じる"
          data-testid="morning-plan-hint-close"
          className="-mr-1 ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-white/80 transition hover:bg-white/20 hover:text-white"
        >
          ×
        </button>
        {/* 右向き矢印: bubble 右側面、CTA pill を水平に指す */}
        <span
          aria-hidden
          className="absolute"
          style={{
            top: '50%',
            right: -7,
            transform: 'translateY(-50%)',
            width: 0,
            height: 0,
            borderTop: '7px solid transparent',
            borderBottom: '7px solid transparent',
            borderLeft: '8px solid rgb(124 58 237)',
          }}
        />
      </div>
      <style jsx>{`
        .morning-plan-hint-bubble {
          animation:
            morning-plan-hint-pop-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both,
            morning-plan-hint-breath 2.6s ease-in-out 0.6s infinite;
          /* 右向き矢印で CTA を指すため、transform-origin は bubble 右側に置く */
          transform-origin: calc(100% + 12px) 50%;
        }
        @keyframes morning-plan-hint-pop-in {
          0% {
            opacity: 0;
            transform: translateX(8px) scale(0.82);
          }
          55% {
            opacity: 1;
            transform: translateX(-3px) scale(1.06);
          }
          100% {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
        @keyframes morning-plan-hint-breath {
          0%,
          100% {
            transform: translateX(0) scale(1);
          }
          50% {
            transform: translateX(-3px) scale(1.025);
          }
        }
      `}</style>
    </div>
  );
}
