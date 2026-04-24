// 先週比矢印 (↑↓→) + 色・ラベル
// tone で「上昇が良いこと / 悪いこと」を指定して色を切り替える
import type { TrendDirection } from '@/features/dashboard/lib/schoolDashboardService';

type Tone = 'up-good' | 'up-bad';

interface TrendArrowProps {
  direction: TrendDirection;
  tone: Tone;
  label: string;
}

const SYMBOLS: Record<TrendDirection, string> = {
  up: '↑',
  down: '↓',
  flat: '→',
};

const COLORS: Record<Tone, Record<TrendDirection, string>> = {
  // 上昇 = 良いこと (例: ポジ率増 → 緑)
  'up-good': {
    up: 'text-green-600',
    down: 'text-red-600',
    flat: 'text-gray-500',
  },
  // 上昇 = 悪いこと (例: 未完了タスク件数増 → 赤)
  'up-bad': {
    up: 'text-red-600',
    down: 'text-green-600',
    flat: 'text-gray-500',
  },
};

export function TrendArrow({ direction, tone, label }: TrendArrowProps) {
  const color = COLORS[tone][direction];
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}
      data-testid={`trend-arrow-${direction}`}
    >
      <span aria-hidden>{SYMBOLS[direction]}</span>
      <span>{label}</span>
    </span>
  );
}
