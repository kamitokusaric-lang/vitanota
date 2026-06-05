// テナント内のタスクタグ一覧 + 各タグの利用件数 を取得する SWR hook
import useSWR from 'swr';
import { jsonFetcher } from '@/shared/lib/fetcher';

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

export function useTaskTags() {
  const { data, error, isLoading, mutate } = useSWR<TagsResponse>(
    '/api/task-tags',
    jsonFetcher,
  );

  // 新規タグを作成し、一覧キャッシュを再取得する。成功で作成された TaskTag を返す。
  const createTag = async (name: string): Promise<TaskTag> => {
    const res = await fetch('/api/task-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message ?? 'タグ作成に失敗しました');
    }
    const { tag } = (await res.json()) as { tag: TaskTag };
    await mutate();
    return tag;
  };

  return { tags: data?.tags, error, isLoading, mutate, createTag };
}
