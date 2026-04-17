import useSWR from 'swr';
import type { AlertListItem } from '../lib/alertService';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ alerts: AlertListItem[] }>;
};

export function useAdminAlerts() {
  const { data, error, isLoading, mutate } = useSWR('/api/admin/alerts', fetcher);
  return { alerts: data?.alerts, error, isLoading, mutate };
}
