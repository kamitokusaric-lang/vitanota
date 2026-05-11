// TaskBoard のフィルタ設定を取得・保存する SWR ベース hook
//
// 使い方:
//   const { preference, isLoading, save } = useTaskFilterPreferences();
//   - preference: TaskFilterSettings | null (未保存なら null、システム初期値を使う)
//   - isLoading: 初回フェッチ中
//   - save(settings): UPSERT、成功時にローカルキャッシュも更新
import useSWR from 'swr';
import { useCallback } from 'react';
import type { TaskFilterSettings } from '@/schemas/userFilterPreferences';

const ENDPOINT = '/api/users/me/filter-preferences/tasks';

interface ApiResponse {
  preference: TaskFilterSettings | null;
}

const fetcher = async (url: string): Promise<ApiResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ApiResponse;
};

export function useTaskFilterPreferences() {
  const { data, error, isLoading, mutate } = useSWR<ApiResponse>(
    ENDPOINT,
    fetcher,
    {
      // 初回ロード以外は再フェッチしない (画面遷移ごとに毎回叩かない)
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  const save = useCallback(
    async (settings: TaskFilterSettings) => {
      const res = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        throw new Error(`保存に失敗しました (HTTP ${res.status})`);
      }
      // ローカルキャッシュを即時更新 (revalidate なし、API は ok のみ返すため)
      await mutate({ preference: settings }, { revalidate: false });
    },
    [mutate],
  );

  return {
    preference: data?.preference ?? null,
    isLoading,
    error,
    save,
  };
}
