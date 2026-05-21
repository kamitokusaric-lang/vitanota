// 日別利用数の折れ線グラフ (recharts)。
// /admin/ai-analytics と /admin/access-distribution の両方から使用。
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface Props {
  data: Array<{ date: string; count: number }>;
  caption: string;
  title?: string;
}

export function DailyCountLineChart({
  data,
  caption,
  title = '日別利用数',
}: Props) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{title}</h2>
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <p className="mb-3 text-[11px] text-gray-400">
          {caption} · 期間合計 {total} 件
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart
            data={data}
            margin={{ top: 5, right: 16, bottom: 5, left: -16 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: '#6b7280' }}
            />
            <Tooltip
              labelFormatter={(v) => v}
              formatter={(value: unknown) => [`${value} 件`, '利用数']}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#4f46e5"
              strokeWidth={2}
              dot={{ r: 3, fill: '#4f46e5' }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
