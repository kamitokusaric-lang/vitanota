import useSWR from 'swr';
import type { Task } from '@/db/schema';

export type TaskWithOwner = Task & { ownerName: string | null };

interface TasksResponse {
  tasks: TaskWithOwner[];
}

const fetcher = async (url: string): Promise<TasksResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export function useTasks(filters?: { ownerUserId?: string }) {
  const qs = filters?.ownerUserId
    ? `?ownerUserId=${encodeURIComponent(filters.ownerUserId)}`
    : '';
  const { data, error, isLoading, mutate } = useSWR(
    `/api/tasks${qs}`,
    fetcher,
  );
  return { tasks: data?.tasks, error, isLoading, mutate };
}
