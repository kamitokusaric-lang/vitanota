// タスクタブ: カンバン UI
import { TaskBoard } from '@/features/tasks/components/TaskBoard';
import type { VitanotaSession } from '@/shared/types/auth';

interface TasksTabProps {
  session: VitanotaSession;
}

export function TasksTab({ session }: TasksTabProps) {
  const isAdmin =
    session.user.roles.includes('school_admin') ||
    session.user.roles.includes('system_admin');
  return (
    <TaskBoard
      selfUserId={session.user.userId}
      canAssignToOthers={isAdmin}
    />
  );
}
