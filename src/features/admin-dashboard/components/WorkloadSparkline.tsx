// 稼働負荷 (未完了タスク数) の 7 日間棒グラフ
import type { WorkloadDay } from '../lib/adminDashboardService';

interface WorkloadSparklineProps {
  data: WorkloadDay[];
  width?: number;
  height?: number;
}

export function WorkloadSparkline({
  data,
  width = 88,
  height = 28,
}: WorkloadSparklineProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[10px] text-gray-300"
        style={{ width, height }}
        data-testid="workload-sparkline-empty"
      >
        データなし
      </div>
    );
  }

  const maxValue = Math.max(1, ...data.map((d) => d.openCount));
  const barWidth = width / data.length;
  const pad = 1;

  return (
    <svg
      width={width}
      height={height}
      className="block"
      data-testid="workload-sparkline"
      aria-label="未完了タスクの 7 日間推移"
    >
      {data.map((d, i) => {
        const h = (d.openCount / maxValue) * (height - 2);
        return (
          <rect
            key={d.day}
            x={i * barWidth + pad}
            y={height - h}
            width={barWidth - pad * 2}
            height={h}
            fill="#6b7280" // gray-500
            rx={1}
          />
        );
      })}
    </svg>
  );
}
