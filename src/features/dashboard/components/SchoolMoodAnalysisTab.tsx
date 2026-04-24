// [学校エンゲージメント] > mood 別分析
// 絵文字 5 段階の日別積み上げ棒 + 先週比 + 合計
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { TrendArrow } from './TrendArrow';
import type {
  MoodDay,
  MoodLevel,
  PeriodKey,
  SchoolMoodAnalysisData,
  TrendDirection,
} from '@/features/dashboard/lib/schoolDashboardService';
import {
  aggregateMoodByWeek,
  PERIOD_COMPARISON_LABEL,
} from '@/features/dashboard/lib/schoolDashboardService';

const fetcher = async (url: string): Promise<SchoolMoodAnalysisData> => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// mood の色 (very_positive = 緑, very_negative = 赤、中立はグレー)
const MOOD_META: Record<MoodLevel, { emoji: string; label: string; color: string }> = {
  very_positive: { emoji: '😊', label: 'とても良い', color: '#16a34a' },
  positive:      { emoji: '🙂', label: '良い',       color: '#86efac' },
  neutral:       { emoji: '😐', label: 'ふつう',     color: '#94a3b8' },
  negative:      { emoji: '😥', label: 'ちょっと大変', color: '#fca5a5' },
  very_negative: { emoji: '😣', label: 'かなり大変', color: '#dc2626' },
};

const MOOD_ORDER: MoodLevel[] = [
  'very_positive',
  'positive',
  'neutral',
  'negative',
  'very_negative',
];

function formatDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function deltaLabel(dir: TrendDirection): string {
  if (dir === 'up') return 'ポジ寄り';
  if (dir === 'down') return 'ネガ寄り';
  return '横ばい';
}

interface StackedBarProps {
  data: MoodDay[];
  height?: number;
  minWidth?: number;
}

function StackedMoodBars({
  data,
  height = 240,
  minWidth = 480,
}: StackedBarProps) {
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

  if (data.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-gray-400">
        データがありません
      </div>
    );
  }

  const width = containerWidth;
  const margin = { top: 16, right: 20, bottom: 40, left: 36 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const maxTotal = Math.max(
    ...data.map(
      (d) =>
        d.very_positive + d.positive + d.neutral + d.negative + d.very_negative,
    ),
    1,
  );
  const n = data.length;
  const barWidth = Math.min(32, (innerW / n) * 0.6);
  const xFor = (i: number) => (i + 0.5) * (innerW / n);
  const hFor = (v: number) => (v / maxTotal) * innerH;

  return (
    <div ref={containerRef} className="w-full overflow-x-auto">
    <svg
      width={width}
      height={height}
      className="block"
      role="img"
      aria-label="全校の mood 分布 (日別積み上げ棒)"
      data-testid="school-mood-chart"
    >
      <g transform={`translate(${margin.left}, ${margin.top})`}>
        <text
          x={-6}
          y={0}
          fontSize={10}
          fill="#999"
          textAnchor="end"
          dominantBaseline="hanging"
        >
          {maxTotal}
        </text>
        <text x={-6} y={innerH} fontSize={10} fill="#999" textAnchor="end">
          0
        </text>
        <line
          x1={0}
          y1={innerH}
          x2={innerW}
          y2={innerH}
          stroke="#e5e5e0"
        />

        {data.map((d, i) => {
          let yCursor = innerH;
          const cx = xFor(i);
          return (
            <g key={d.day}>
              {MOOD_ORDER.map((m) => {
                const v = d[m];
                if (v === 0) return null;
                const h = hFor(v);
                yCursor -= h;
                return (
                  <rect
                    key={m}
                    x={cx - barWidth / 2}
                    y={yCursor}
                    width={barWidth}
                    height={h}
                    fill={MOOD_META[m].color}
                  >
                    <title>
                      {`${formatDay(d.day)} ${MOOD_META[m].emoji} ${MOOD_META[m].label}: ${v} 件`}
                    </title>
                  </rect>
                );
              })}
            </g>
          );
        })}

        {data.map((d, i) => (
          <text
            key={`x-${d.day}`}
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

      {/* 凡例 (絵文字と色のみ、ラベルなし) */}
      <g transform={`translate(${margin.left}, ${height - 10})`}>
        {MOOD_ORDER.map((m, i) => (
          <g key={m} transform={`translate(${i * 50}, 0)`}>
            <rect x={0} y={-6} width={12} height={10} fill={MOOD_META[m].color} />
            <text x={16} y={4} fontSize={14}>
              {MOOD_META[m].emoji}
            </text>
          </g>
        ))}
      </g>
    </svg>
    </div>
  );
}

interface SchoolMoodAnalysisTabProps {
  period?: PeriodKey;
}

export function SchoolMoodAnalysisTab({
  period = '1w',
}: SchoolMoodAnalysisTabProps = {}) {
  const { data, error, isLoading } = useSWR<SchoolMoodAnalysisData>(
    `/api/school/mood-analysis?period=${period}`,
    fetcher,
  );

  if (isLoading) {
    return (
      <div className="py-10 text-center">
        <LoadingSpinner label="ムードデータを読み込み中" />
      </div>
    );
  }
  if (error || !data) {
    return <ErrorMessage message="ムードデータの取得に失敗しました" />;
  }

  return (
    <div className="space-y-6" data-testid="school-mood-analysis-tab">
      {/* サマリ行 (ムード別分析は blue 系) */}
      <div className="flex flex-wrap items-center gap-6 rounded-vn border border-blue-200 bg-blue-50 px-5 py-4">
        <div className="flex flex-col">
          <span className="text-[11px] text-gray-500">今期ムード付き投稿</span>
          <span className="text-xl font-semibold text-gray-900">
            {data.totalWithMood}
            <span className="ml-1 text-xs text-gray-500">件</span>
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] text-gray-500">
            {PERIOD_COMPARISON_LABEL[period]} (ポジ寄り度)
          </span>
          <TrendArrow
            direction={data.moodWeekDelta}
            tone="up-good"
            label={deltaLabel(data.moodWeekDelta)}
          />
        </div>
        <div className="flex flex-wrap gap-4">
          {MOOD_ORDER.map((m) => (
            <div
              key={m}
              className="flex items-center gap-1.5"
              title={MOOD_META[m].label}
            >
              <span className="text-lg leading-none">
                {MOOD_META[m].emoji}
              </span>
              <span className="text-sm font-semibold text-gray-800">
                {data.totalByMood[m]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 積み上げ棒 (3 ヶ月のときだけ週別集約) */}
      <div className="rounded-vn border border-vn-border bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-gray-800">
          ムードの分布{period === '3m' ? ' (週別)' : ''}
        </h3>
        <StackedMoodBars
          data={
            period === '3m'
              ? aggregateMoodByWeek(data.moodTrend)
              : data.moodTrend
          }
        />
      </div>

      <p className="text-[11px] text-gray-500">
        公開・非公開問わず、投稿時に選ばれたムード絵文字を集計しています。ムード未設定の既存投稿は含みません。
      </p>
    </div>
  );
}
