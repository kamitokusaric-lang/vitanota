// [学校エンゲージメント] school_admin 特権タブ
// 上部に期間セレクタ (1週間 / 1ヶ月 / 3ヶ月) を持ち、
// 下の 3 つのグラフ (mood / タグ / 稼働負荷) が同じ期間で切り替わる
import { useState } from 'react';
import { PeriodSelector } from './PeriodSelector';
import { SchoolMoodAnalysisTab } from './SchoolMoodAnalysisTab';
import { SchoolWellnessTab } from './SchoolWellnessTab';
import { TeachersWorkloadTab } from './TeachersWorkloadTab';
import type { PeriodKey } from '@/features/dashboard/lib/schoolDashboardService';

export function SchoolEngagementTab() {
  const [period, setPeriod] = useState<PeriodKey>('1w');

  return (
    <div className="space-y-10" data-testid="school-engagement-tab">
      <div className="flex items-center justify-between rounded-vn border border-vn-border bg-white px-5 py-3">
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          ムード別分析
        </h2>
        <SchoolMoodAnalysisTab period={period} />
      </section>
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          タグ別分析
        </h2>
        <SchoolWellnessTab period={period} />
      </section>
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          稼働負荷状況
        </h2>
        <TeachersWorkloadTab period={period} />
      </section>
    </div>
  );
}
