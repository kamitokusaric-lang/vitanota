// 管理者ダッシュボード「タイムライン」タブ
// 上部: 教員ステータス表
// 下部: 共有タイムライン (tenant 内公開投稿)
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { TeacherStatusTable } from '@/features/admin-dashboard/components/TeacherStatusTable';
import { TimelineList } from '@/features/journal/components/TimelineList';
import { useTeacherStatuses } from '@/features/admin-dashboard/hooks/useTeacherStatuses';

export function AdminTimelineTab() {
  const { teachers, error, isLoading } = useTeacherStatuses();

  return (
    <div data-testid="admin-timeline-tab" className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-800">教員ステータス</h2>
        {error && <ErrorMessage message="教員データの取得に失敗しました" />}
        {isLoading && (
          <div className="py-10 text-center text-sm text-gray-400">読み込み中...</div>
        )}
        {!isLoading && !error && teachers && (
          <TeacherStatusTable teachers={teachers} />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-800">共有タイムライン</h2>
        <TimelineList />
      </section>
    </div>
  );
}
