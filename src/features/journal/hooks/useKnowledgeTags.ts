// テナント内のナレッジタグ一覧 + 各タグの利用件数 を取得する SWR hook (useTaskTags と同パターン)
import useSWR from 'swr';

export interface KnowledgeTag {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  assignmentCount: number;
}

interface TagsResponse {
  tags: KnowledgeTag[];
}

const fetcher = async (url: string): Promise<TagsResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export function useKnowledgeTags() {
  const { data, error, isLoading, mutate } = useSWR<TagsResponse>(
    '/api/private/journal/knowledge-tags',
    fetcher,
  );
  return { tags: data?.tags, error, isLoading, mutate };
}
