// [全体] > 全体エンゲージ: 学校全体の元気度 (個人特定なし)
import useSWR from 'swr';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { SchoolWellnessChart } from './SchoolWellnessChart';
import { TrendArrow } from './TrendArrow';
import type {
  EmotionDay,
  PeriodKey,
  TrendDirection,
} from '@/features/dashboard/lib/schoolDashboardService';
import {
  aggregateEmotionByWeek,
  aggregateTotalByWeek,
  PERIOD_COMPARISON_LABEL,
} from '@/features/dashboard/lib/schoolDashboardService';

interface WellnessResponse {
  emotionTrend: EmotionDay[];
  emotionWeekDelta: TrendDirection;
  totalPostsByDay: Array<{ day: string; total: number }>;
  activeTeachersThisWeek: number;
}

const fetcher = async (url: string): Promise<WellnessResponse> => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

function deltaLabel(dir: TrendDirection): string {
  if (dir === 'up') return 'ポジ寄り';
  if (dir === 'down') return 'ネガ寄り';
  return '横ばい';
}

interface SchoolWellnessTabProps {
  period?: PeriodKey;
}

export function SchoolWellnessTab({
  period = '1w',
}: SchoolWellnessTabProps = {}) {
  const { data, error, isLoading } = useSWR<WellnessResponse>(
    `/api/school/wellness?period=${period}`,
    fetcher,
  );

  if (isLoading) {
    return (
      <div className="py-10 text-center">
        <LoadingSpinner label="全校データを読み込み中" />
      </div>
    );
  }
  if (error || !data) {
    return <ErrorMessage message="全校データの取得に失敗しました" />;
  }

  const totalThisWeek = data.totalPostsByDay.reduce((a, b) => a + b.total, 0);

  return (
    <div
      className="space-y-6"
      data-testid="school-wellness-tab"
    >
      {/* サマリ行 (タグ別分析は amber 系) */}
      <div className="flex flex-wrap items-center gap-6 rounded-vn border border-amber-200 bg-amber-50 px-5 py-4">
        <div className="flex flex-col">
          <span className="text-[11px] text-gray-500">今期の投稿数</span>
          <span className="text-xl font-semibold text-gray-900">
            {totalThisWeek}
            <span className="ml-1 text-xs text-gray-500">件</span>
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] text-gray-500">投稿した教員</span>
          <span className="text-xl font-semibold text-gray-900">
            {data.activeTeachersThisWeek}
            <span className="ml-1 text-xs text-gray-500">人</span>
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] text-gray-500">
            {PERIOD_COMPARISON_LABEL[period]} (ポジ率)
          </span>
          <TrendArrow
            direction={data.emotionWeekDelta}
            tone="up-good"
            label={deltaLabel(data.emotionWeekDelta)}
          />
        </div>
      </div>

      {/* 折れ線グラフ (3 ヶ月のときだけ週別集約) */}
      <div className="rounded-vn border border-vn-border bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-gray-800">
          感情の動き{period === '3m' ? ' (週別)' : ''}
        </h3>
        <SchoolWellnessChart
          emotionTrend={
            period === '3m'
              ? aggregateEmotionByWeek(data.emotionTrend)
              : data.emotionTrend
          }
          totalPostsByDay={
            period === '3m'
              ? aggregateTotalByWeek(data.totalPostsByDay)
              : data.totalPostsByDay
          }
        />
      </div>

      {/* 注記 */}
      <p className="text-[11px] text-gray-500">
        自発的に投稿されたタグ付き記録の集計です。タグなし投稿も含む
        総投稿件数は下段のバーで参照できます。
      </p>
    </div>
  );
}
