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

// 期間フィルタ:
//   default: 今やるべきもの 3 点セット (今週 + null + 期限切れ未完了)
//   range:   純粋に due_date が from〜to のもののみ
export type TaskDateFilter =
  | { mode: 'default'; weekStart: string; weekEnd: string }
  | { mode: 'range'; from: string; to: string };

export interface UseTasksFilters {
  ownerUserId?: string;
  scope?: 'mine';
  dateFilter?: TaskDateFilter;
}

export function useTasks(filters?: UseTasksFilters) {
  const params = new URLSearchParams();
  if (filters?.scope) params.set('scope', filters.scope);
  if (filters?.ownerUserId && !filters.scope) {
    params.set('ownerUserId', filters.ownerUserId);
  }
  if (filters?.dateFilter?.mode === 'default') {
    params.set('mode', 'default');
    params.set('weekStart', filters.dateFilter.weekStart);
    params.set('weekEnd', filters.dateFilter.weekEnd);
  } else if (filters?.dateFilter?.mode === 'range') {
    params.set('mode', 'range');
    params.set('from', filters.dateFilter.from);
    params.set('to', filters.dateFilter.to);
  }
  const qs = params.toString() ? `?${params.toString()}` : '';
  const { data, error, isLoading, mutate } = useSWR(
    `/api/tasks${qs}`,
    fetcher,
  );
  return { tasks: data?.tasks, error, isLoading, mutate };
}
