// 汎用バブルチャート (recharts ScatterChart)。
// x=日付 / y=時間帯(0-23 JST) / バブルの大きさ=件数 / 色=系列。
// access-distribution の全メトリクス (UU / AI 整理 / 日々ノート / タスク / カレンダー) を
// この 1 component で表現する (chimo 2026-05-30、 ヒートマップ + 折れ線を廃止)。
//
// - 単一系列 (UU / AI 整理 / 日々ノート / タスク): 1 色。 内訳 (非公開 / 完了) は
//   point.sub に持たせ、 ツールチップに「うち{subLabel} N」 として出す。
// - 複数系列 (カレンダー): event 種別ごとに色分け + 凡例。
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export interface BubblePoint {
  date: string; // YYYY-MM-DD (JST)
  hour: number; // 0-23 (JST)
  count: number;
  sub?: number; // 任意の内訳件数 (日々ノート=非公開 / タスク=完了)
}

export interface BubbleSeries {
  key: string;
  label: string;
  color: string;
  points: BubblePoint[];
}

interface Props {
  series: BubbleSeries[];
  title: string;
  caption: string;
  unit?: string; // 既定 '件'、 UU は '人'
  subLabel?: string; // ツールチップの内訳ラベル (例 '非公開' / '完了')
  showLegend?: boolean; // 複数系列のとき true
}

const Y_TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

interface ChartPoint {
  x: number;
  hour: number;
  count: number;
  sub?: number;
  date: string;
  label: string;
  multi: boolean;
}

function makeTooltip(unit: string, subLabel?: string) {
  return function BubbleTooltip({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: ChartPoint }>;
  }) {
    if (!active || !payload || payload.length === 0) return null;
    const p = payload[0].payload;
    return (
      <div className="rounded border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] shadow-sm">
        <div className="font-semibold text-gray-700">
          {p.date} {p.hour}時台
        </div>
        <div className="text-gray-500">
          {p.multi ? `${p.label}: ` : ''}
          {p.count} {unit}
          {subLabel && typeof p.sub === 'number'
            ? ` (うち${subLabel} ${p.sub})`
            : ''}
        </div>
      </div>
    );
  };
}

export function MetricBubbleChart({
  series,
  title,
  caption,
  unit = '件',
  subLabel,
  showLegend = false,
}: Props) {
  const allPoints = series.flatMap((s) => s.points);
  const total = allPoints.reduce((sum, p) => sum + p.count, 0);
  const multi = series.length > 1;

  // x 軸は日付インデックス (数値) で整列を確実にする
  const dates = Array.from(new Set(allPoints.map((p) => p.date))).sort();
  const dateIndex = new Map(dates.map((d, i) => [d, i]));
  const tickInterval = Math.max(1, Math.ceil(dates.length / 12));
  const xTicks = dates.map((_, i) => i).filter((i) => i % tickInterval === 0);

  const chartSeries = series.map((s) => ({
    ...s,
    chartPoints: s.points.map<ChartPoint>((p) => ({
      x: dateIndex.get(p.date) ?? 0,
      hour: p.hour,
      count: p.count,
      sub: p.sub,
      date: p.date,
      label: s.label,
      multi,
    })),
  }));

  const Tip = makeTooltip(unit, subLabel);

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{title}</h2>
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <p className="mb-3 text-[11px] text-gray-400">
          {caption} · 期間合計 {total} {unit}
        </p>
        {dates.length === 0 ? (
          <p className="py-12 text-center text-[11px] text-gray-400">
            この期間のデータはまだありません
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 5, right: 16, bottom: 5, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                type="number"
                dataKey="x"
                domain={[-0.5, dates.length - 0.5]}
                ticks={xTicks}
                tickFormatter={(i: number) => dates[i]?.slice(5) ?? ''}
                tick={{ fontSize: 11, fill: '#6b7280' }}
              />
              <YAxis
                type="number"
                dataKey="hour"
                domain={[0, 24]}
                ticks={Y_TICKS}
                tickFormatter={(v: number) => `${v}時`}
                tick={{ fontSize: 11, fill: '#6b7280' }}
              />
              <ZAxis type="number" dataKey="count" range={[30, 400]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={<Tip />}
              />
              {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {chartSeries.map((s) => (
                <Scatter
                  key={s.key}
                  name={s.label}
                  data={s.chartPoints}
                  fill={s.color}
                  fillOpacity={0.6}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
