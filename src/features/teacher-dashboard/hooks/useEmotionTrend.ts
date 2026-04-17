import useSWR from 'swr';
import type { EmotionTrendResponse } from '../schemas/emotionTrend';

const fetcher = async (url: string): Promise<EmotionTrendResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<EmotionTrendResponse>;
};

export function useEmotionTrend(period: 'week' | 'month' | 'quarter') {
  const { data, error, isLoading } = useSWR<EmotionTrendResponse>(
    `/api/private/dashboard/emotion-trend?period=${period}`,
    fetcher
  );

  return { data, error, isLoading };
}
