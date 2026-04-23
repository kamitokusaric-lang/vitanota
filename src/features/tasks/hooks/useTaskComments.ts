import useSWR from 'swr';
import type { TaskComment } from '@/db/schema';

export type TaskCommentWithUser = TaskComment & { userName: string | null };

interface CommentsResponse {
  comments: TaskCommentWithUser[];
}

const fetcher = async (url: string): Promise<CommentsResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export function useTaskComments(taskId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    taskId ? `/api/tasks/${taskId}/comments` : null,
    fetcher,
  );
  return {
    comments: data?.comments ?? [],
    error,
    isLoading,
    mutate,
  };
}
