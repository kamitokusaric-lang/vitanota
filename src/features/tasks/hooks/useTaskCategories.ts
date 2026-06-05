import useSWR from 'swr';
import { jsonFetcher } from '@/shared/lib/fetcher';
import type { TaskCategory } from '@/db/schema';

interface CategoriesResponse {
  categories: TaskCategory[];
}

export function useTaskCategories() {
  const { data, error, isLoading } = useSWR(
    '/api/task-categories',
    jsonFetcher<CategoriesResponse>,
  );
  return { categories: data?.categories, error, isLoading };
}
