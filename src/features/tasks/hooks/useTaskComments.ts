import useSWR from 'swr';
import { jsonFetcher } from '@/shared/lib/fetcher';
import type { TaskComment } from '@/db/schema';

export type TaskCommentWithUser = TaskComment & { userName: string | null };

interface CommentsResponse {
  comments: TaskCommentWithUser[];
}

export function useTaskComments(taskId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    taskId ? `/api/tasks/${taskId}/comments` : null,
    jsonFetcher<CommentsResponse>,
  );
  return {
    comments: data?.comments ?? [],
    error,
    isLoading,
    mutate,
  };
}
