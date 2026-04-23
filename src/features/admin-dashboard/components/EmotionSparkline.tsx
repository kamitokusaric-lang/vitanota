// 感情 3 軸折れ線スパークライン (7 日分)
// SVG で軽量描画、ポジティブ=緑 / ネガティブ=赤 / ニュートラル=グレー
import type { EmotionDay } from '../lib/adminDashboardService';

interface EmotionSparklineProps {
  data: EmotionDay[];
  width?: number;
  height?: number;
}

const COLORS = {
  positive: '#16a34a', // green-600
  negative: '#dc2626', // red-600
  neutral: '#9ca3af', // gray-400
};

export function EmotionSparkline({
  data,
  width = 88,
  height = 28,
}: EmotionSparklineProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[10px] text-gray-300"
        style={{ width, height }}
        data-testid="emotion-sparkline-empty"
      >
        記録なし
      </div>
    );
  }

  const maxValue = Math.max(
    1,
    ...data.flatMap((d) => [d.positive, d.negative, d.neutral]),
  );
  const step = data.length > 1 ? width / (data.length - 1) : 0;
  const y = (v: number) => height - (v / maxValue) * (height - 4) - 2;

  const toPath = (values: number[]) =>
    values
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${y(v)}`)
      .join(' ');

  const pos = toPath(data.map((d) => d.positive));
  const neg = toPath(data.map((d) => d.negative));
  const neu = toPath(data.map((d) => d.neutral));

  return (
    <svg
      width={width}
      height={height}
      className="block"
      data-testid="emotion-sparkline"
      aria-label="感情 3 軸の 7 日間トレンド"
    >
      <path d={neu} stroke={COLORS.neutral} strokeWidth={1.5} fill="none" />
      <path d={neg} stroke={COLORS.negative} strokeWidth={1.5} fill="none" />
      <path d={pos} stroke={COLORS.positive} strokeWidth={1.5} fill="none" />
    </svg>
  );
}
