// 先週比矢印 (↑↓→) + 色表示
// 感情: up=悪化 (赤)、down=改善 (緑)、flat=横ばい (グレー)
// 稼働負荷: up=増加 (赤)、down=減少 (緑)、flat=横ばい (グレー)
import type { TrendDirection } from '../lib/adminDashboardService';

interface TrendArrowProps {
  direction: TrendDirection;
  label?: string;
}

const CONFIG: Record<TrendDirection, { symbol: string; color: string; text: string }> = {
  up: { symbol: '↑', color: 'text-red-600', text: '重く' },
  down: { symbol: '↓', color: 'text-green-600', text: '軽く' },
  flat: { symbol: '→', color: 'text-gray-400', text: '変わらず' },
};

export function TrendArrow({ direction, label }: TrendArrowProps) {
  const config = CONFIG[direction];
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${config.color}`}
      data-testid={`trend-arrow-${direction}`}
    >
      <span aria-hidden>{config.symbol}</span>
      <span>{label ?? config.text}</span>
    </span>
  );
}
