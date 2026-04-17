import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { EmotionTrendDataPoint } from '../schemas/emotionTrend';

interface EmotionTrendChartProps {
  data: EmotionTrendDataPoint[];
  periodDays: number;
}

function fillMissingDates(
  data: EmotionTrendDataPoint[],
  periodDays: number
): EmotionTrendDataPoint[] {
  const dateMap = new Map(data.map((d) => [d.date, d]));
  const filled: EmotionTrendDataPoint[] = [];

  const now = new Date();
  // Asia/Tokyo
  const tokyoOffset = 9 * 60;
  const utcNow = now.getTime() + now.getTimezoneOffset() * 60_000;
  const tokyoNow = new Date(utcNow + tokyoOffset * 60_000);

  for (let i = periodDays - 1; i >= 0; i--) {
    const d = new Date(tokyoNow);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    filled.push(
      dateMap.get(dateStr) ?? {
        date: dateStr,
        positive: 0,
        negative: 0,
        neutral: 0,
        total: 0,
      }
    );
  }

  return filled;
}

function formatDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export function EmotionTrendChart({
  data,
  periodDays,
}: EmotionTrendChartProps) {
  const filledData = fillMissingDates(data, periodDays);

  return (
    <div data-testid="emotion-trend-chart" className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={filledData}>
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 12 }}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip
            labelFormatter={(label) => formatDate(String(label))}
            formatter={(value, name) => {
              const labels: Record<string, string> = {
                positive: 'ポジティブ',
                negative: 'ネガティブ',
                neutral: 'ニュートラル',
              };
              return [Number(value), labels[String(name)] ?? String(name)];
            }}
          />
          <Legend
            formatter={(value: string) => {
              const labels: Record<string, string> = {
                positive: 'ポジティブ',
                negative: 'ネガティブ',
                neutral: 'ニュートラル',
              };
              return labels[value] ?? value;
            }}
          />
          <Line
            type="monotone"
            dataKey="positive"
            stroke="#22c55e"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="negative"
            stroke="#ef4444"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="neutral"
            stroke="#9ca3af"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
