import useSWR from 'swr';
import type { TeacherStatusCard } from '../lib/adminDashboardService';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ teachers: TeacherStatusCard[] }>;
};

export function useTeacherStatuses() {
  const { data, error, isLoading, mutate } = useSWR('/api/admin/teachers', fetcher);
  return { teachers: data?.teachers, error, isLoading, mutate };
}
