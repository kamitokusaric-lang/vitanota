// [職員室ボード] > 全体のタスクボード: 全員のタスクが見えるカンバン
// AssigneeFilter で特定教員のタスクに絞り込める。他人のタスクは閲覧のみ
// (編集・ステータス変更は自分のタスクだけ、でも新規アサインは誰にでも可能)
import { TaskBoard } from '@/features/tasks/components/TaskBoard';
import type { VitanotaSession } from '@/shared/types/auth';

interface StaffroomTasksTabProps {
  session: VitanotaSession;
}

export function StaffroomTasksTab({ session }: StaffroomTasksTabProps) {
  return (
    <TaskBoard
      selfUserId={session.user.userId}
      mode="staffroom"
    />
  );
}
