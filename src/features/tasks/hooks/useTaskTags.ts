// テナント内のタスクタグ一覧 + 各タグの利用件数 を取得する SWR hook
import useSWR from 'swr';

export interface TaskTag {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  assignmentCount: number;
}

interface TagsResponse {
  tags: TaskTag[];
}

const fetcher = async (url: string): Promise<TagsResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export function useTaskTags() {
  const { data, error, isLoading, mutate } = useSWR<TagsResponse>(
    '/api/task-tags',
    fetcher,
  );
  return { tags: data?.tags, error, isLoading, mutate };
}
