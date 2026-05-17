// 単一タスク取得 SWR hook
//
// 使い方:
//   const { task, isLoading, error, mutate } = useTask(taskId);
//   - taskId が null/undefined のときは fetch しない
//   - 取得失敗 (404 含む) で error がセットされ、task は undefined
//
// 想定用途: TodayPlanView / PlanResultModal でタスクタイトルクリック →
//   taskId をセット → 取得完了で TaskEditModal を表示
import useSWR from 'swr';
import type { TaskWithAssignees } from './useTasks';

interface ApiResponse {
  task: TaskWithAssignees;
}

const fetcher = async (url: string): Promise<ApiResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ApiResponse;
};

export function useTask(taskId: string | null | undefined) {
  const key = taskId ? `/api/tasks/${taskId}` : null;
  const { data, error, isLoading, mutate } = useSWR<ApiResponse>(key, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  return {
    task: data?.task,
    isLoading,
    error,
    mutate,
  };
}
