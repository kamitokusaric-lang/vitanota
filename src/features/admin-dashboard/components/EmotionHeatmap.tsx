// 感情 3 軸 × 7 日ヒートマップ (GitHub 草スタイル)
// 行: ポジ / 中 / ネガ、列: 7 日分
import type { EmotionDay } from '../lib/adminDashboardService';
import { HeatmapCell } from './HeatmapCell';

interface EmotionHeatmapProps {
  data: EmotionDay[];
  cellSize?: number;
}

const PALETTE = {
  positive: ['#edf7f2', '#b8dbc8', '#7fbd9d', '#52a876'] as const, // vn-green 系
  neutral: ['#f5f3ee', '#d8d4c7', '#a9a69a', '#6b6b63'] as const, // vn-bg 系
  negative: ['#fdecea', '#f4c0bc', '#e88982', '#e05252'] as const, // vn-red 系
};

const ROWS = [
  { key: 'positive' as const, label: 'ポジ' },
  { key: 'neutral' as const, label: '中' },
  { key: 'negative' as const, label: 'ネガ' },
];

function formatDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export function EmotionHeatmap({ data, cellSize = 20 }: EmotionHeatmapProps) {
  const gap = 3;
  if (data.length === 0) {
    return (
      <span className="text-[10px] text-gray-300" data-testid="emotion-heatmap-empty">
        記録なし
      </span>
    );
  }

  return (
    <div className="inline-flex items-start gap-2" data-testid="emotion-heatmap">
      <div
        className="flex flex-col text-[10px] text-gray-500"
        style={{ gap }}
      >
        {ROWS.map((r) => (
          <span
            key={r.key}
            className="flex items-center"
            style={{ height: cellSize, lineHeight: `${cellSize}px` }}
          >
            {r.label}
          </span>
        ))}
      </div>
      <div className="flex flex-col" style={{ gap }}>
        {ROWS.map((row) => (
          <div key={row.key} className="flex" style={{ gap }}>
            {data.map((d) => (
              <HeatmapCell
                key={d.day + row.key}
                palette={PALETTE[row.key]}
                value={d[row.key]}
                label={`${formatDay(d.day)} ${row.label}: ${d[row.key]} 件`}
                size={cellSize}
              />
            ))}
          </div>
        ))}
        {/* X 軸: 最初と最後の日付を薄く */}
        <div
          className="flex justify-between text-[9px] text-gray-400"
          style={{ width: data.length * (cellSize + gap) - gap }}
        >
          <span>{formatDay(data[0].day)}</span>
          <span>{formatDay(data[data.length - 1].day)}</span>
        </div>
      </div>
    </div>
  );
}
