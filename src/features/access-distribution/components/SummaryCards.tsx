import type { AccessDistributionSummary } from '@/features/access-distribution/types';

interface SummaryCardsProps {
  summary: AccessDistributionSummary;
}

// UU 同士の比率を % 表記。 分母 0 のときは "-" を返す (0 除算を回避)
function formatRate(numerator: number, denominator: number): string {
  if (denominator === 0) return '-';
  const rate = (numerator / denominator) * 100;
  return `${rate.toFixed(0)}%`;
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

export function SummaryCards({ summary }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <Card
        label="総 UU"
        value={summary.totalUu.toLocaleString()}
        caption="期間内ユニーク user_id (sessions.created_at)"
      />
      <Card
        label="AI 整理 (H1) 利用数"
        value={summary.totalQuickCaptureSessions.toLocaleString()}
        caption="期間内 quick_capture セッション件数"
      />
      <Card
        label="日々ノート登録数"
        value={`${summary.totalJournalEntries.toLocaleString()} (${summary.totalJournalPrivateEntries.toLocaleString()})`}
        caption="合算 (うち非公開)、 journal_entries 件数"
      />
      <Card
        label="タスク操作数"
        value={`${summary.totalTaskTouches.toLocaleString()} (${summary.totalTaskCompletes.toLocaleString()})`}
        caption="updated_at 件数 (うち完了)、 tasks 件数"
      />
      <Card
        label="朝カード (H3-B) を見た先生"
        value={`${summary.morningCardShownUu.toLocaleString()} 人`}
        caption={`反応 ${formatRate(summary.morningCardCandidateStatusChangedUu, summary.morningCardShownUu)} (${summary.morningCardCandidateStatusChangedUu}人) / 閉×${formatRate(summary.morningCardDismissedUu, summary.morningCardShownUu)} / 候補押 ${formatRate(summary.morningCardCandidateClickedUu, summary.morningCardShownUu)}`}
      />
    </div>
  );
}
