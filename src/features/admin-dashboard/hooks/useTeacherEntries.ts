import useSWR from 'swr';
import type { Tag } from '@/db/schema';

export type TeacherEntry = {
  id: string;
  content: string;
  createdAt: string;
  tags: Array<Pick<Tag, 'id' | 'name' | 'type' | 'category'>>;
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ entries: TeacherEntry[] }>;
};

export function useTeacherEntries(teacherId: string) {
  const { data, error, isLoading } = useSWR(
    `/api/admin/teachers/${teacherId}/entries?perPage=20`,
    fetcher
  );
  return { entries: data?.entries, error, isLoading };
}
