// 教員ステータステーブル（POC デザインベース）
// カードグリッドからテーブル + スパークライン + ステータスピルに変更
import type { TeacherStatusCard } from '../lib/adminDashboardService';
import { EmotionRatioBar } from './EmotionRatioBar';
import { Sparkline } from './Sparkline';

interface TeacherStatusTableProps {
  teachers: TeacherStatusCard[];
  onTeacherClick?: (userId: string) => void;
}

function calcScore(summary: TeacherStatusCard['emotionSummary']): number {
  if (summary.total === 0) return 0;
  return Math.round((summary.positive * 100 + summary.neutral * 50) / summary.total);
}

type Status = 'red' | 'yellow' | 'green';

function getStatus(score: number): Status {
  if (score >= 70) return 'green';
  if (score >= 40) return 'yellow';
  return 'red';
}

const STATUS_CONFIG: Record<Status, { label: string; dot: string; bg: string; text: string }> = {
  red: { label: '要注意', dot: 'bg-vn-red', bg: 'bg-vn-red-bg', text: 'text-vn-red' },
  yellow: { label: '注意', dot: 'bg-vn-gold', bg: 'bg-vn-gold-bg', text: 'text-vn-gold-text' },
  green: { label: '良好', dot: 'bg-vn-green', bg: 'bg-vn-green-bg', text: 'text-vn-green-text' },
};

function formatLastEntry(date: string | null): string {
  if (!date) return '記録なし';
  const last = new Date(date);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return '今日';
  if (diffDays === 1) return '昨日';
  return `${diffDays}日前`;
}

export function TeacherStatusTable({
  teachers,
  onTeacherClick,
}: TeacherStatusTableProps) {
  if (teachers.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-gray-500" data-testid="teacher-table-empty">
        教員が登録されていません
      </div>
    );
  }

  // スコア順でソート（低い順 → 要注意が上）
  const sorted = [...teachers].sort((a, b) => calcScore(a.emotionSummary) - calcScore(b.emotionSummary));

  return (
    <div className="overflow-hidden rounded-vn border border-vn-border" data-testid="teacher-status-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-vn-border bg-vn-bg text-left text-[11px] uppercase tracking-wider text-vn-muted">
            <th className="px-[18px] py-[14px] font-medium">名前</th>
            <th className="px-[18px] py-[14px] font-medium">状態</th>
            <th className="px-[18px] py-[14px] font-medium">感情バランス</th>
            <th className="px-[18px] py-[14px] font-medium">最終記録</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((teacher) => {
            const score = calcScore(teacher.emotionSummary);
            const status = getStatus(score);
            const config = STATUS_CONFIG[status];

            return (
              <tr
                key={teacher.userId}
                className={`border-b border-[#f5f4f1] transition-colors ${
                  onTeacherClick ? 'cursor-pointer hover:bg-vn-bg' : ''
                }`}
                onClick={
                  onTeacherClick ? () => onTeacherClick(teacher.userId) : undefined
                }
                data-testid={`teacher-row-${teacher.userId}`}
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{teacher.name}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.bg} ${config.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
                    {config.label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="w-24">
                    <EmotionRatioBar
                      positive={teacher.emotionSummary.positive}
                      negative={teacher.emotionSummary.negative}
                      neutral={teacher.emotionSummary.neutral}
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {formatLastEntry(teacher.lastEntryDate)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
