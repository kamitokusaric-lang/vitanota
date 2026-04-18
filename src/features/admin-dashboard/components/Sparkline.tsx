// 教員一覧テーブル用の小さな折れ線グラフ（POC デザインベース）
// 素の SVG で描画（Recharts は不要な規模）

interface SparklineProps {
  values: number[]; // スコア (0-100) の配列
}

function scoreColor(val: number): string {
  if (val >= 70) return '#52a876';
  if (val >= 40) return '#d4a853';
  return '#e05252';
}

export function Sparkline({ values }: SparklineProps) {
  if (values.length < 2) {
    return <span className="text-xs text-gray-300">データなし</span>;
  }

  const W = 100;
  const H = 32;
  const PAD = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => ({
    x: PAD + (i / (values.length - 1)) * (W - PAD * 2),
    y: PAD + (1 - (v - min) / range) * (H - PAD * 2),
    v,
  }));

  const lastColor = scoreColor(values[values.length - 1]);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`)
    .join(' ');

  return (
    <svg
      width={W}
      height={H}
      className="block"
      data-testid="sparkline"
    >
      <path
        d={d}
        fill="none"
        stroke={lastColor}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === points.length - 1 ? 3 : 2}
          fill={i === points.length - 1 ? lastColor : '#fff'}
          stroke={lastColor}
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}
