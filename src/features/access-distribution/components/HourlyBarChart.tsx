import type { HourlyDataPoint } from '@/features/access-distribution/types';

interface HourlyBarChartProps {
  hourly: HourlyDataPoint[];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function Bar({
  label,
  count,
  max,
  color,
}: {
  label: string;
  count: number;
  max: number;
  color: string;
}) {
  const width = max === 0 ? 0 : Math.round((count / max) * 100);
  return (
    <div className="flex items-center gap-3 py-1 text-sm">
      <div className="w-14 shrink-0 text-gray-700">{label}</div>
      <div className="relative h-5 flex-1 overflow-hidden rounded bg-gray-100">
        <div
          className={`absolute inset-y-0 left-0 ${color}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="w-20 shrink-0 text-right tabular-nums text-gray-600">
        {count.toLocaleString()}
      </div>
    </div>
  );
}

export function HourlyBarChart({ hourly }: HourlyBarChartProps) {
  const pvMax = Math.max(1, ...hourly.map((h) => h.pv));
  const uuMax = Math.max(1, ...hourly.map((h) => h.uu));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">時間帯別 PV</h3>
        <div className="space-y-0.5">
          {hourly.map((h) => (
            <Bar
              key={h.hour}
              label={`${pad(h.hour)}:00`}
              count={h.pv}
              max={pvMax}
              color="bg-blue-400/70"
            />
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">時間帯別 UU</h3>
        <div className="space-y-0.5">
          {hourly.map((h) => (
            <Bar
              key={h.hour}
              label={`${pad(h.hour)}:00`}
              count={h.uu}
              max={uuMax}
              color="bg-emerald-400/70"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
