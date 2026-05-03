import useSWR from 'swr';
import type { Task } from '@/db/schema';

export interface TaskTagSummary {
  id: string;
  name: string;
}

export interface TaskAssigneeSummary {
  userId: string;
  name: string | null;
  nickname: string | null;
}

export type TaskWithAssignees = Task & {
  assignees: TaskAssigneeSummary[];
  commentCount: number;
  tags: TaskTagSummary[];
};

interface TasksResponse {
  tasks: TaskWithAssignees[];
}

const fetcher = async (url: string): Promise<TasksResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export function useTasks(filters?: { ownerUserId?: string; scope?: 'mine' }) {
  const params = new URLSearchParams();
  if (filters?.scope) params.set('scope', filters.scope);
  if (filters?.ownerUserId && !filters.scope) {
    params.set('ownerUserId', filters.ownerUserId);
  }
  const qs = params.toString() ? `?${params.toString()}` : '';
  const { data, error, isLoading, mutate } = useSWR(
    `/api/tasks${qs}`,
    fetcher,
  );
  return { tasks: data?.tasks, error, isLoading, mutate };
}
