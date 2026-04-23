// 稼働負荷 (Done 以外タスク件数) × 7 日ヒートマップ
// 1 行のみ、濃淡で件数を表現 (vn-gold 系)
import type { WorkloadDay } from '../lib/adminDashboardService';
import { HeatmapCell } from './HeatmapCell';

interface WorkloadHeatmapProps {
  data: WorkloadDay[];
  cellSize?: number;
}

const PALETTE = ['#f5f3ee', '#ead8a4', '#d4a853', '#8a6b2a'] as const; // vn-bg → vn-gold → darker

function formatDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export function WorkloadHeatmap({ data, cellSize = 20 }: WorkloadHeatmapProps) {
  const gap = 3;
  if (data.length === 0) {
    return (
      <span
        className="text-[10px] text-gray-300"
        data-testid="workload-heatmap-empty"
      >
        データなし
      </span>
    );
  }

  return (
    <div className="inline-flex flex-col" data-testid="workload-heatmap">
      <div className="flex" style={{ gap }}>
        {data.map((d) => (
          <HeatmapCell
            key={d.day}
            palette={PALETTE}
            value={d.openCount}
            label={`${formatDay(d.day)}: 未完了 ${d.openCount} 件`}
            size={cellSize}
          />
        ))}
      </div>
      <div
        className="mt-1 flex justify-between text-[9px] text-gray-400"
        style={{ width: data.length * (cellSize + gap) - gap }}
      >
        <span>{formatDay(data[0].day)}</span>
        <span>{formatDay(data[data.length - 1].day)}</span>
      </div>
    </div>
  );
}
