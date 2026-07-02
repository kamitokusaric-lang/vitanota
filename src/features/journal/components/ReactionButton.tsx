// 投稿カードの reaction ボタン (knowledge / appreciation / endorsement)。
// 絵文字 + 押下時のワンショット跳ねアニメ (chimo 2026-06-25 design)。
// rail 通常カード / AI カード / EntryCard の 3 箇所で共用。配色・サイズは props で渡す。
import { useState, type CSSProperties } from 'react';
import type { JournalReactionType } from '@/features/journal/schemas/journal';
import { REACTION_META } from './reactionMeta';

// 押下時に絵文字の周囲へ飛び散るキラキラの方向 (px・放射状 10 方向)。
const SPARKLES = [
  { x: '0px', y: '-26px' },
  { x: '16px', y: '-20px' },
  { x: '25px', y: '-5px' },
  { x: '22px', y: '13px' },
  { x: '10px', y: '24px' },
  { x: '-10px', y: '24px' },
  { x: '-22px', y: '13px' },
  { x: '-25px', y: '-5px' },
  { x: '-16px', y: '-20px' },
  { x: '0px', y: '22px' },
];

export function ReactionButton({
  type,
  count,
  mine,
  onToggle,
  testId,
  shapeClass,
  notMineClass,
  iconSize,
}: {
  type: JournalReactionType;
  count: number;
  mine: boolean;
  onToggle: () => void;
  testId: string;
  shapeClass: string; // 形状 (サイズ・border・group など、配色を除く)
  notMineClass: string; // 非 mine の配色
  iconSize: number; // lucide アイコンの size
}) {
  const meta = REACTION_META[type];
  const Icon = meta.Icon;
  // mine の配色は type 別 (design 2026-06-25: ☕茶 / 👍ピンク / 💡白)。
  const buttonClass = `${shapeClass} ${mine ? meta.mineClass : notMineClass}`;
  // 押下のたびに +1 して emoji span を再マウント → アニメを再生。初回 (0) は再生しない。
  const [popKey, setPopKey] = useState(0);
  return (
    <button
      type="button"
      onClick={() => {
        onToggle();
        setPopKey((k) => k + 1);
      }}
      aria-pressed={mine}
      aria-label={meta.ariaLabel}
      className={buttonClass}
      data-testid={testId}
    >
      <span
        key={popKey}
        className={`relative inline-flex items-center ${popKey > 0 ? 'animate-reaction-pop' : ''}`}
        aria-hidden
      >
        <Icon size={iconSize} strokeWidth={2.5} aria-hidden />
        {popKey > 0 &&
          SPARKLES.map((s, i) => (
            <span
              key={i}
              className="pointer-events-none absolute left-1/2 top-1/2 animate-reaction-sparkle text-[11px]"
              style={{ '--sx': s.x, '--sy': s.y } as CSSProperties}
            >
              ✨
            </span>
          ))}
      </span>
      {count > 0 && <span>{count}</span>}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-[10px] font-normal text-white opacity-0 shadow-md transition-opacity duration-150 group-hover/reaction:opacity-100 group-focus-visible/reaction:opacity-100"
      >
        {meta.label}
      </span>
    </button>
  );
}
