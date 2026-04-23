// 先週比矢印 (↑↓→) + 色・ラベル
// tone で「上昇が良いこと or 悪いこと」を指定して色を切り替える
import type { TrendDirection } from '../lib/adminDashboardService';

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
  // 上昇 = 良いこと (例: 感情のポジ率増 → 緑)
  'up-good': {
    up: 'text-vn-green-text',
    down: 'text-vn-red',
    flat: 'text-vn-muted',
  },
  // 上昇 = 悪いこと (例: 未完了タスク件数増 → 赤)
  'up-bad': {
    up: 'text-vn-red',
    down: 'text-vn-green-text',
    flat: 'text-vn-muted',
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
