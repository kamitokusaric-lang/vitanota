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

export function SummaryCards({ summary }: SummaryCardsProps) {
  // chimo 2026-05-20: 「朝の見通し (H3) 利用数」 カードは撤去 (project_h3_reframing_20260520)
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
    </div>
  );
}
