import type { TeacherStatusCard as TeacherStatusCardData } from '../lib/adminDashboardService';
import { EmotionRatioBar } from './EmotionRatioBar';

interface TeacherStatusCardProps {
  teacher: TeacherStatusCardData;
  onClick: (userId: string) => void;
}

function formatLastEntry(date: string | null): string {
  if (!date) return '記録なし';
  const last = new Date(date);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return '今日';
  if (diffDays === 1) return '昨日';
  return `${diffDays}日前`;
}

export function TeacherStatusCard({ teacher, onClick }: TeacherStatusCardProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(teacher.userId)}
      className="w-full rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
      data-testid={`teacher-status-card-${teacher.userId}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-gray-900">{teacher.name}</span>
        {teacher.openAlertCount > 0 && (
          <span
            className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700"
            data-testid={`teacher-alert-badge-${teacher.userId}`}
          >
            {teacher.openAlertCount}
          </span>
        )}
      </div>

      <EmotionRatioBar
        positive={teacher.emotionSummary.positive}
        negative={teacher.emotionSummary.negative}
        neutral={teacher.emotionSummary.neutral}
      />

      <p className="mt-2 text-xs text-gray-500">
        最終記録: {formatLastEntry(teacher.lastEntryDate)}
      </p>
    </button>
  );
}
