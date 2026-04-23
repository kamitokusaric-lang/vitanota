// GitHub 草グラフ風のヒートマップ 1 マス
// 4 段階 (0 / 1 / 2-3 / 4+) で palette 配列の色を選ぶ
interface HeatmapCellProps {
  palette: readonly [string, string, string, string]; // step 0..3
  value: number;
  label: string;
  size: number;
}

function step(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  return 3;
}

export function HeatmapCell({ palette, value, label, size }: HeatmapCellProps) {
  return (
    <div
      title={label}
      aria-label={label}
      style={{
        width: size,
        height: size,
        backgroundColor: palette[step(value)],
        borderRadius: 3,
      }}
      data-testid="heatmap-cell"
    />
  );
}
