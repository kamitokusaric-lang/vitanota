// [全体] > 稼働状況: 教員別の未完了タスク件数推移 (全員に公開)
// タスクは業務量の客観指標であり、カンバンで既に全員に可視化されているため
// 名前付きで推移を出すことも情報公開の増加にはならない (踏み絵通過)
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { TrendArrow } from './TrendArrow';
import type {
  PeriodKey,
  TeacherWorkloadCard,
  WorkloadDay,
} from '@/features/dashboard/lib/schoolDashboardService';
import {
  PERIOD_COMPARISON_LABEL,
  PERIOD_LABEL,
} from '@/features/dashboard/lib/schoolDashboardService';

// 未完了タスクの日別推移を週単位で集約 (週末の件数を代表値として採用)
function aggregateWorkloadByWeek(days: WorkloadDay[]): WorkloadDay[] {
  const weeks: WorkloadDay[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    if (chunk.length === 0) continue;
    const last = chunk[chunk.length - 1];
    // 未完了タスク件数はスナップショットなので合算せず末日の件数を使う
    weeks.push({ day: last.day, openCount: last.openCount });
  }
  return weeks;
}

interface WorkloadResponse {
  teachers: TeacherWorkloadCard[];
}

const fetcher = async (url: string): Promise<WorkloadResponse> => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

function formatDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function WorkloadSparkline({ data }: { data: WorkloadDay[] }) {
  const svgRef = useRef<HTMLDivElement>(null);
  const [svgWidth, setSvgWidth] = useState<number>(180);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setSvgWidth(Math.max(w, 120));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (data.length < 2) {
    return <span className="text-[10px] text-gray-300">データなし</span>;
  }
  const W = svgWidth;
  const H = 44;
  const PAD = 4;
  const max = Math.max(...data.map((d) => d.openCount), 1);
  const n = data.length;
  const xFor = (i: number) => PAD + (i / (n - 1)) * (W - PAD * 2);
  const yFor = (v: number) => PAD + (1 - v / max) * (H - PAD * 2);
  const pathD = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(d.openCount)}`)
    .join(' ');
  const lastValue = data[data.length - 1].openCount;

  return (
    <div className="flex items-center gap-2">
      <div ref={svgRef} className="flex-1 min-w-[120px]">
        <svg width={W} height={H} className="block">
          <path
            d={pathD}
            fill="none"
            stroke="#d97706"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {data.map((d, i) => (
            <circle
              key={i}
              cx={xFor(i)}
              cy={yFor(d.openCount)}
              r={i === n - 1 ? 3.5 : 2.5}
              fill="#d97706"
              stroke="#fff"
              strokeWidth={1}
            >
              <title>{`${formatDay(d.day)}: 未完了 ${d.openCount} 件`}</title>
            </circle>
          ))}
        </svg>
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-medium text-gray-700">
        {lastValue}
        <span className="ml-0.5 text-[10px] text-gray-500">件</span>
      </span>
    </div>
  );
}

interface TeachersWorkloadTabProps {
  period?: PeriodKey;
}

export function TeachersWorkloadTab({
  period = '1w',
}: TeachersWorkloadTabProps = {}) {
  const { data, error, isLoading } = useSWR<WorkloadResponse>(
    `/api/school/teachers-workload?period=${period}`,
    fetcher,
  );

  if (isLoading) {
    return (
      <div className="py-10 text-center">
        <LoadingSpinner label="稼働データを読み込み中" />
      </div>
    );
  }
  if (error || !data) {
    return <ErrorMessage message="稼働データの取得に失敗しました" />;
  }

  if (data.teachers.length === 0) {
    return (
      <div
        className="py-10 text-center text-sm text-gray-400"
        data-testid="teachers-workload-empty"
      >
        教員が登録されていません
      </div>
    );
  }

  return (
    <div data-testid="teachers-workload-tab" className="space-y-3">
      <p className="text-[11px] text-gray-500">
        未完了タスクの件数推移。前期との差で{PERIOD_COMPARISON_LABEL[period]}を判定しています。
      </p>
      <div className="overflow-x-auto rounded-vn border border-vn-border bg-white">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-vn-border bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-500">
              <th className="w-[180px] px-5 py-3 font-medium">教員</th>
              <th className="px-5 py-3 font-medium">
                未完了タスク推移 ({PERIOD_LABEL[period]})
              </th>
              <th className="w-[120px] px-5 py-3 font-medium">先週比</th>
            </tr>
          </thead>
          <tbody>
            {data.teachers.map((t) => (
              <tr
                key={t.userId}
                className="border-b border-[#f5f4f1]"
                data-testid={`teachers-workload-row-${t.userId}`}
              >
                <td className="whitespace-nowrap px-5 py-4 align-middle">
                  <div className="font-medium text-gray-900">
                    {t.nickname ?? t.name}
                  </div>
                  {t.nickname && (
                    <div className="text-[11px] text-gray-400">{t.name}</div>
                  )}
                </td>
                <td className="px-5 py-4 align-middle">
                  <WorkloadSparkline
                    data={
                      period === '3m'
                        ? aggregateWorkloadByWeek(t.workloadTrend)
                        : t.workloadTrend
                    }
                  />
                </td>
                <td className="whitespace-nowrap px-5 py-4 align-middle">
                  <TrendArrow
                    direction={t.workloadWeekDelta}
                    tone="up-bad"
                    label={
                      t.workloadWeekDelta === 'up'
                        ? '増加'
                        : t.workloadWeekDelta === 'down'
                          ? '減少'
                          : '変わらず'
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
