import useSWR from 'swr';

export interface Assignee {
  userId: string;
  name: string | null;
  email: string;
}

interface AssigneesResponse {
  assignees: Assignee[];
}

const fetcher = async (url: string): Promise<AssigneesResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export function useAssignees() {
  const { data, error, isLoading } = useSWR(
    '/api/tasks/assignees',
    fetcher,
  );
  return { assignees: data?.assignees, error, isLoading };
}
