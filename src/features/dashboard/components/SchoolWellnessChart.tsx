// 全校の感情集計を可視化する折れ線 + 総投稿件数バー
// ポジ=緑太線 / ネガ=赤太線 / ニュートラル=薄グレー点線 / 総投稿=下部バー
// chimo 要件: 折れ線が見づらいのは絶対避ける・色の可視性担保
// 幅は親コンテナに追従 (ResizeObserver) し、最小 480px を確保
import { useEffect, useRef, useState } from 'react';
import type { EmotionDay } from '@/features/dashboard/lib/schoolDashboardService';

interface SchoolWellnessChartProps {
  emotionTrend: EmotionDay[];
  totalPostsByDay: Array<{ day: string; total: number }>;
  height?: number;
  minWidth?: number;
}

function formatDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export function SchoolWellnessChart({
  emotionTrend,
  totalPostsByDay,
  height = 280,
  minWidth = 480,
}: SchoolWellnessChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(minWidth);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setContainerWidth(Math.max(w, minWidth));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [minWidth]);

  if (emotionTrend.length === 0) {
    return (
      <div
        className="py-10 text-center text-sm text-gray-400"
        data-testid="school-wellness-chart-empty"
      >
        データがありません
      </div>
    );
  }

  const width = containerWidth;
  const margin = { top: 16, right: 20, bottom: 60, left: 36 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  // 折れ線エリアは innerH の上 75%、バーエリアは下 15% (間 10% 空け)
  const lineAreaH = innerH * 0.75;
  const barAreaTop = innerH * 0.85;
  const barAreaH = innerH * 0.15;

  const maxEmotion = Math.max(
    ...emotionTrend.flatMap((d) => [d.positive, d.negative, d.neutral]),
    1,
  );
  const maxTotal = Math.max(...totalPostsByDay.map((d) => d.total), 1);

  const n = emotionTrend.length;
  const xFor = (i: number) => (i / Math.max(n - 1, 1)) * innerW;
  const yFor = (v: number) => lineAreaH - (v / maxEmotion) * lineAreaH;
  const barHFor = (v: number) => (v / maxTotal) * barAreaH;

  const linePath = (key: 'positive' | 'negative' | 'neutral') =>
    emotionTrend
      .map((d, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(d[key])}`)
      .join(' ');

  return (
    <div ref={containerRef} className="w-full overflow-x-auto">
    <svg
      width={width}
      height={height}
      className="block"
      role="img"
      aria-label="全校の感情集計折れ線グラフ"
      data-testid="school-wellness-chart"
    >
      <g transform={`translate(${margin.left}, ${margin.top})`}>
        {/* Y 軸 max / 0 */}
        <text x={-6} y={0} fontSize={10} fill="#999" textAnchor="end" dominantBaseline="hanging">
          {maxEmotion}
        </text>
        <text x={-6} y={lineAreaH} fontSize={10} fill="#999" textAnchor="end">
          0
        </text>

        {/* ゼロ基準線 */}
        <line
          x1={0}
          y1={lineAreaH}
          x2={innerW}
          y2={lineAreaH}
          stroke="#e5e5e0"
          strokeDasharray="2 2"
        />

        {/* 総投稿件数バー (下部) */}
        {totalPostsByDay.map((d, i) => (
          <rect
            key={`bar-${i}`}
            x={xFor(i) - 10}
            y={barAreaTop + barAreaH - barHFor(d.total)}
            width={20}
            height={Math.max(barHFor(d.total), d.total > 0 ? 2 : 0)}
            fill="#d4d4d0"
          >
            <title>{`${formatDay(d.day)}: 投稿 ${d.total} 件`}</title>
          </rect>
        ))}

        {/* ニュートラル線 (薄め・点線) */}
        <path
          d={linePath('neutral')}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={2}
          strokeDasharray="4 3"
          opacity={0.7}
        />

        {/* ポジ線 */}
        <path
          d={linePath('positive')}
          fill="none"
          stroke="#16a34a"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {emotionTrend.map((d, i) => (
          <circle
            key={`p-${i}`}
            cx={xFor(i)}
            cy={yFor(d.positive)}
            r={4}
            fill="#16a34a"
            stroke="#fff"
            strokeWidth={1}
          >
            <title>{`${formatDay(d.day)} ポジ: ${d.positive} 件`}</title>
          </circle>
        ))}

        {/* ネガ線 */}
        <path
          d={linePath('negative')}
          fill="none"
          stroke="#dc2626"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {emotionTrend.map((d, i) => (
          <circle
            key={`n-${i}`}
            cx={xFor(i)}
            cy={yFor(d.negative)}
            r={4}
            fill="#dc2626"
            stroke="#fff"
            strokeWidth={1}
          >
            <title>{`${formatDay(d.day)} ネガ: ${d.negative} 件`}</title>
          </circle>
        ))}

        {/* X 軸 日付ラベル */}
        {emotionTrend.map((d, i) => (
          <text
            key={`x-${i}`}
            x={xFor(i)}
            y={innerH + 14}
            fontSize={11}
            fill="#555"
            textAnchor="middle"
          >
            {formatDay(d.day)}
          </text>
        ))}
      </g>

      {/* 凡例 (下部) */}
      <g transform={`translate(${margin.left}, ${height - 14})`} fontSize={11} fill="#333">
        <circle cx={6} cy={0} r={4} fill="#16a34a" />
        <text x={16} y={4}>ポジ</text>

        <circle cx={72} cy={0} r={4} fill="#dc2626" />
        <text x={82} y={4}>ネガ</text>

        <line x1={140} y1={0} x2={160} y2={0} stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 3" opacity={0.7} />
        <text x={164} y={4}>ニュートラル</text>

        <rect x={250} y={-5} width={12} height={10} fill="#d4d4d0" />
        <text x={266} y={4}>総投稿数</text>
      </g>
    </svg>
    </div>
  );
}
