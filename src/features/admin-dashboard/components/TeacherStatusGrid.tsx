import type { TeacherStatusCard as TeacherStatusCardData } from '../lib/adminDashboardService';
import { TeacherStatusCard } from './TeacherStatusCard';

interface TeacherStatusGridProps {
  teachers: TeacherStatusCardData[];
  onTeacherClick: (userId: string) => void;
}

export function TeacherStatusGrid({ teachers, onTeacherClick }: TeacherStatusGridProps) {
  if (teachers.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-gray-500" data-testid="teacher-grid-empty">
        教員が登録されていません
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="teacher-status-grid">
      {teachers.map((teacher) => (
        <TeacherStatusCard
          key={teacher.userId}
          teacher={teacher}
          onClick={onTeacherClick}
        />
      ))}
    </div>
  );
}
