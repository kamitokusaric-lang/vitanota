import Link from 'next/link';
import type { EmotionTrendResponse } from '../schemas/emotionTrend';

interface EmotionSummaryCardProps {
  data: EmotionTrendResponse | undefined;
  isLoading: boolean;
}

const MIN_ENTRIES = 3;

export function EmotionSummaryCard({
  data,
  isLoading,
}: EmotionSummaryCardProps) {
  if (isLoading) {
    return (
      <div
        className="animate-pulse rounded-lg bg-gray-100 p-4"
        data-testid="emotion-summary-card-skeleton"
      >
        <div className="h-4 w-32 rounded bg-gray-200" />
        <div className="mt-2 h-6 w-48 rounded bg-gray-200" />
      </div>
    );
  }

  if (!data || data.totalEntries < MIN_ENTRIES) {
    return null;
  }

  const totals = data.data.reduce(
    (acc, d) => ({
      positive: acc.positive + d.positive,
      negative: acc.negative + d.negative,
      neutral: acc.neutral + d.neutral,
    }),
    { positive: 0, negative: 0, neutral: 0 }
  );

  return (
    <div
      className="rounded-vn border border-vn-border bg-white p-4"
      data-testid="emotion-summary-card"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">直近7日の感情傾向</p>
          <div className="mt-1 flex gap-4 text-sm">
            <span className="text-green-600">
              ポジティブ {totals.positive}
            </span>
            <span className="text-red-600">
              ネガティブ {totals.negative}
            </span>
            <span className="text-gray-500">
              ニュートラル {totals.neutral}
            </span>
          </div>
        </div>
        <Link
          href="/dashboard/teacher"
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          data-testid="emotion-summary-card-link"
        >
          詳細を見る
        </Link>
      </div>
    </div>
  );
}
