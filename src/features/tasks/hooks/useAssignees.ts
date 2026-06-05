import useSWR from 'swr';
import { jsonFetcher } from '@/shared/lib/fetcher';

export interface Assignee {
  userId: string;
  name: string | null;
  email: string;
}

interface AssigneesResponse {
  assignees: Assignee[];
}

export function useAssignees() {
  const { data, error, isLoading } = useSWR(
    '/api/tasks/assignees',
    jsonFetcher<AssigneesResponse>,
  );
  return { assignees: data?.assignees, error, isLoading };
}
