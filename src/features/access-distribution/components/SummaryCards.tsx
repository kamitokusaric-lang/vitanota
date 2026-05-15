import type { AccessDistributionSummary } from '@/features/access-distribution/types';

interface SummaryCardsProps {
  summary: AccessDistributionSummary;
}

function Card({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-gray-900">{value}</div>
      {caption && <div className="mt-1 text-[11px] text-gray-400">{caption}</div>}
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card
        label="総 PV"
        value={summary.totalPv.toLocaleString()}
        caption="期間内 HTTP リクエスト数"
      />
      <Card
        label="総 UU"
        value={summary.totalUu.toLocaleString()}
        caption="期間内ユニーク user_id"
      />
      <Card
        label="ピーク時間帯"
        value={`${pad(summary.peakHour)}:00`}
        caption={`${summary.peakHourPv.toLocaleString()} PV (時間帯合計)`}
      />
      <Card
        label="平均 PV / 時"
        value={Math.round(summary.avgPvPerHour).toLocaleString()}
        caption="24 時間 × 期間日数で平均化"
      />
    </div>
  );
}
