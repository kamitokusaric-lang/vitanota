// オンボーディング状態 (コーチマーク表示状態等) を取得・保存する SWR hook。
//
// 使い方:
//   const { state, isLoading, shouldShow, markAdvanced, markDismissed } =
//     useOnboardingState('ai_capture', AI_CAPTURE_COACHMARK_VERSION);
//
// shouldShow: state が null (= 未表示) かつ dismissedAt なし、かつバージョン一致。
//             バージョン不一致 (= 文言変更後) でも、現状は再表示しない方針。
//             再表示動線は post-mvp-backlog 候補。
//
// ai_chat 計測イベント (advanced/dismissed) は本 hook の中で /api/ai-chat/events に
// 投げるのではなく、AiCaptureCoachmark 側で fetch する (本 hook は永続化のみ責務)。
import useSWR from 'swr';
import { useCallback } from 'react';
import type {
  AiCaptureOnboardingState,
  OnboardingContext,
} from '@/schemas/userOnboardingStates';

interface ApiResponse {
  state: AiCaptureOnboardingState | null;
}

const fetcher = async (url: string): Promise<ApiResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ApiResponse;
};

/**
 * コーチマークを表示すべきかを判定する純関数。
 *
 * - state が未保存 (null) のときのみ true。
 * - dismissedAt が入っていれば false (= 閉じた人には再表示しない)。
 * - SWR が読み込み中 (isLoading) または error 時は誤表示防止のため false。
 * - バージョン不一致でも今回は再表示しない (押し付け感排除を優先、再表示は post-mvp-backlog 候補)。
 */
export function computeShouldShow(args: {
  isLoading: boolean;
  error: unknown;
  state: AiCaptureOnboardingState | null;
}): boolean {
  if (args.isLoading) return false;
  if (args.error) return false;
  return args.state === null;
}

export function useOnboardingState(context: OnboardingContext, version: string) {
  const endpoint = `/api/users/me/onboarding-states/${context}`;
  const { data, error, isLoading, mutate } = useSWR<ApiResponse>(endpoint, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const state = data?.state ?? null;
  const shouldShow = computeShouldShow({ isLoading, error, state });

  const save = useCallback(
    async (next: AiCaptureOnboardingState) => {
      // optimistic update: 即座にローカル反映 → fetch
      await mutate({ state: next }, { revalidate: false });
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        // 保存失敗時は再取得してロールバック
        await mutate();
        throw new Error(`保存に失敗しました (HTTP ${res.status})`);
      }
    },
    [endpoint, mutate],
  );

  const markAdvanced = useCallback(
    async (step: 1 | 2 | 3) => {
      await save({
        completedStep: step,
        version,
      });
    },
    [save, version],
  );

  const markDismissed = useCallback(
    async (step: 1 | 2 | 3) => {
      await save({
        dismissedAt: new Date().toISOString(),
        completedStep: step,
        version,
      });
    },
    [save, version],
  );

  return {
    state,
    isLoading,
    error,
    shouldShow,
    markAdvanced,
    markDismissed,
  };
}
