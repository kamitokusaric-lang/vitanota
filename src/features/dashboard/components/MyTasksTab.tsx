// [自分] > タスク: 自分にアサインされたタスクだけを表示
// TaskBoard の canAssignToOthers=false モードで「自分のタスクのみ」に固定
// school_admin も [自分] タブではこの動作 (他人にアサインしたいときは [全体] 側の運用)
import { TaskBoard } from '@/features/tasks/components/TaskBoard';
import type { VitanotaSession } from '@/shared/types/auth';

interface MyTasksTabProps {
  session: VitanotaSession;
}

export function MyTasksTab({ session }: MyTasksTabProps) {
  return (
    <TaskBoard
      selfUserId={session.user.userId}
      canAssignToOthers={false}
    />
  );
}
