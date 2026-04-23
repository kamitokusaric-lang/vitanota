// 教員ステータス表
// カラム: 名前 / 感情バランス (GitHub 草ヒートマップ) / 感情先週比 /
//         稼働負荷 (ヒートマップ) / 稼働負荷先週比 / 最終記録
// AI 分析は使わない (管理者が他者を AI 分析しない踏み絵)
import type { TeacherStatusCard } from '../lib/adminDashboardService';
import { EmotionHeatmap } from './EmotionHeatmap';
import { WorkloadHeatmap } from './WorkloadHeatmap';
import { TrendArrow } from './TrendArrow';

interface TeacherStatusTableProps {
  teachers: TeacherStatusCard[];
  onTeacherClick?: (userId: string) => void;
}

function formatLastEntry(date: string | null): string {
  if (!date) return '記録なし';
  const last = new Date(date);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24),
  );
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
      <div
        className="py-10 text-center text-sm text-gray-500"
        data-testid="teacher-table-empty"
      >
        教員が登録されていません
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-vn border border-vn-border"
      data-testid="teacher-status-table"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-vn-border bg-vn-bg text-left text-[11px] uppercase tracking-wider text-vn-muted">
            <th className="px-5 py-3 font-medium">名前</th>
            <th className="px-5 py-3 font-medium">感情バランス (7 日)</th>
            <th className="px-5 py-3 font-medium">先週比</th>
            <th className="px-5 py-3 font-medium">稼働負荷 (7 日)</th>
            <th className="px-5 py-3 font-medium">先週比</th>
            <th className="px-5 py-3 font-medium">最終記録</th>
          </tr>
        </thead>
        <tbody>
          {teachers.map((teacher) => (
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
              <td className="whitespace-nowrap px-5 py-4 align-middle">
                <div className="font-medium text-gray-900">
                  {teacher.nickname ?? teacher.name}
                </div>
                {teacher.nickname && (
                  <div className="text-[11px] text-gray-400">{teacher.name}</div>
                )}
              </td>
              <td className="px-5 py-4 align-middle">
                <EmotionHeatmap data={teacher.emotionTrend} />
              </td>
              <td className="whitespace-nowrap px-5 py-4 align-middle">
                <TrendArrow
                  direction={teacher.emotionWeekDelta}
                  tone="up-good"
                  label={
                    teacher.emotionWeekDelta === 'up'
                      ? 'ポジ寄り'
                      : teacher.emotionWeekDelta === 'down'
                        ? 'ネガ寄り'
                        : '横ばい'
                  }
                />
              </td>
              <td className="px-5 py-4 align-middle">
                <WorkloadHeatmap data={teacher.workloadTrend} />
              </td>
              <td className="whitespace-nowrap px-5 py-4 align-middle">
                <TrendArrow
                  direction={teacher.workloadWeekDelta}
                  tone="up-bad"
                  label={
                    teacher.workloadWeekDelta === 'up'
                      ? '重く'
                      : teacher.workloadWeekDelta === 'down'
                        ? '軽く'
                        : '変わらず'
                  }
                />
              </td>
              <td className="whitespace-nowrap px-5 py-4 align-middle text-xs text-gray-500">
                {formatLastEntry(teacher.lastEntryDate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
