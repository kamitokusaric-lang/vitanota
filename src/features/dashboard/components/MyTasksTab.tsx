// [マイボード] > タスクボード: 自分にアサインされたタスクだけを表示
// 他人にアサインする操作はできる (マイボードから他人に振ると、振った人のタスク
// 一覧から消えて相手の一覧に移る)
import { TaskBoard } from '@/features/tasks/components/TaskBoard';
import type { VitanotaSession } from '@/shared/types/auth';

interface MyTasksTabProps {
  session: VitanotaSession;
}

export function MyTasksTab({ session }: MyTasksTabProps) {
  return (
    <TaskBoard
      selfUserId={session.user.userId}
      mode="personal"
    />
  );
}
