import useSWR from 'swr';
import type { TaskCategory } from '@/db/schema';

interface CategoriesResponse {
  categories: TaskCategory[];
}

const fetcher = async (url: string): Promise<CategoriesResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export function useTaskCategories() {
  const { data, error, isLoading } = useSWR(
    '/api/task-categories',
    fetcher,
  );
  return { categories: data?.categories, error, isLoading };
}
