import type { HeatmapRow } from '@/features/access-distribution/types';

interface HeatmapTableProps {
  heatmap: HeatmapRow[];
  title?: string;
  caption?: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// cell 背景色 (HSL): 値が max に近いほど濃い青、0 は透明
function cellStyle(value: number, max: number): React.CSSProperties {
  if (max === 0 || value === 0) {
    return { backgroundColor: 'transparent', color: '#9ca3af' };
  }
  const relative = value / max;
  const lightness = 100 - Math.round(relative * 60); // 100% (薄) → 40% (濃)
  return {
    backgroundColor: `hsl(220, 80%, ${lightness}%)`,
    color: relative > 0.5 ? 'white' : '#1f2937',
  };
}

export function HeatmapTable({ heatmap, title, caption }: HeatmapTableProps) {
  const max = Math.max(1, ...heatmap.flatMap((row) => row.hours));

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-3">
      {title && (
        <div className="mb-2 px-1">
          <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
          {caption && <p className="mt-0.5 text-[11px] text-gray-500">{caption}</p>}
        </div>
      )}
      <table className="text-[10px] tabular-nums">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-semibold text-gray-600">
              日付
            </th>
            {Array.from({ length: 24 }, (_, h) => (
              <th
                key={h}
                className="px-1 py-1 text-center font-normal text-gray-500"
              >
                {pad(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heatmap.map((row) => (
            <tr key={row.date}>
              <td className="sticky left-0 z-10 bg-white px-2 py-0.5 font-mono text-gray-700">
                {row.date}
              </td>
              {row.hours.map((v, h) => {
                const sub = row.subHours?.[h] ?? 0;
                const label =
                  v > 0
                    ? sub > 0
                      ? `${v.toLocaleString()} (${sub.toLocaleString()})`
                      : v.toLocaleString()
                    : '';
                const titleText =
                  row.subHours !== undefined
                    ? `${row.date} ${pad(h)}:00: ${v.toLocaleString()} (うち非公開 ${sub.toLocaleString()})`
                    : `${row.date} ${pad(h)}:00: ${v.toLocaleString()}`;
                return (
                  <td
                    key={h}
                    className="min-w-[2rem] border border-gray-100 px-1 py-0.5 text-center"
                    style={cellStyle(v, max)}
                    title={titleText}
                  >
                    {label}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
