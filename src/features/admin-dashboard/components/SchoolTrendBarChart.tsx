// 学校全体の感情傾向 — 棒グラフ（POC デザインベース）
// スコア = (positive * 100 + neutral * 50) / total（0-100）
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { EmotionTrendDataPoint } from '@/features/teacher-dashboard/schemas/emotionTrend';

interface SchoolTrendBarChartProps {
  data: EmotionTrendDataPoint[];
  periodDays: number;
}

function calcScore(d: EmotionTrendDataPoint): number {
  if (d.total === 0) return 0;
  return Math.round((d.positive * 100 + d.neutral * 50) / d.total);
}

function scoreColor(score: number): string {
  if (score >= 70) return '#52a876';
  if (score >= 40) return '#d4a853';
  return '#e05252';
}

function formatDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function fillMissingDates(
  data: EmotionTrendDataPoint[],
  periodDays: number
): Array<EmotionTrendDataPoint & { score: number }> {
  const dateMap = new Map(data.map((d) => [d.date, d]));
  const filled: Array<EmotionTrendDataPoint & { score: number }> = [];

  const now = new Date();
  const tokyoOffset = 9 * 60;
  const utcNow = now.getTime() + now.getTimezoneOffset() * 60_000;
  const tokyoNow = new Date(utcNow + tokyoOffset * 60_000);

  for (let i = periodDays - 1; i >= 0; i--) {
    const d = new Date(tokyoNow);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const point = dateMap.get(dateStr) ?? {
      date: dateStr,
      positive: 0,
      negative: 0,
      neutral: 0,
      total: 0,
    };
    filled.push({ ...point, score: calcScore(point) });
  }

  return filled;
}

export function SchoolTrendBarChart({
  data,
  periodDays,
}: SchoolTrendBarChartProps) {
  const filledData = fillMissingDates(data, periodDays);
  const latestWithData = [...filledData].reverse().find((d) => d.total > 0);
  const latestScore = latestWithData?.score ?? 0;

  // 前回データとの差分
  const withDataPoints = filledData.filter((d) => d.total > 0);
  const prev = withDataPoints.length >= 2 ? withDataPoints[withDataPoints.length - 2].score : latestScore;
  const diff = latestScore - prev;

  const trendLabel =
    diff > 0
      ? `↑ ${diff}点 改善`
      : diff < 0
      ? `↓ ${Math.abs(diff)}点 悪化`
      : '→ 横ばい';
  const trendColor = diff > 0 ? '#52a876' : diff < 0 ? '#e05252' : '#aaa';

  return (
    <div data-testid="school-trend-bar-chart">
      {/* ヘッダー: スコア + トレンド */}
      <div className="mb-3 flex items-baseline gap-3">
        <span className="text-sm font-medium text-gray-700">学校全体の元気度</span>
        <span
          className="text-2xl font-extrabold"
          style={{ color: scoreColor(latestScore) }}
        >
          {latestScore}
          <span className="ml-0.5 text-xs font-normal text-gray-400">点</span>
        </span>
        <span className="text-xs" style={{ color: trendColor }}>
          {trendLabel}
        </span>
      </div>

      {/* 棒グラフ */}
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filledData} barCategoryGap="15%">
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 10, fill: '#aaa' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tick={{ fontSize: 9, fill: '#ccc' }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip
              formatter={(value) => [`${Number(value)}点`, '元気度']}
              labelFormatter={(label) => formatDate(String(label))}
            />
            <Bar dataKey="score" radius={[3, 3, 0, 0]}>
              {filledData.map((entry, index) => (
                <Cell
                  key={entry.date}
                  fill={scoreColor(entry.score)}
                  opacity={index === filledData.length - 1 ? 1 : 0.45}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
