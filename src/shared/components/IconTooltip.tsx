// アイコンに hover / focus 時の薄い背景 + tooltip ラベルを付与する wrapper
// children に lucide-react などの icon component を渡す前提
import type { ReactNode } from 'react';

interface IconTooltipProps {
  label: string;
  children: ReactNode;
  testId?: string;
  // tooltip の方向 (default: 下)
  placement?: 'top' | 'bottom';
}

export function IconTooltip({
  label,
  children,
  testId,
  placement = 'bottom',
}: IconTooltipProps) {
  const tooltipPos =
    placement === 'top'
      ? 'bottom-full mb-1'
      : 'top-full mt-1';

  return (
    <span
      className="group relative inline-flex rounded p-0.5 transition-colors hover:bg-gray-100 focus-within:bg-gray-100"
      role="img"
      aria-label={label}
      tabIndex={0}
      data-testid={testId}
    >
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-[10px] font-normal text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${tooltipPos}`}
      >
        {label}
      </span>
    </span>
  );
}
