// カレンダー用のタスク取得 hook。 既存 useTasks の薄いラッパー。
// Phase 7 (chimo 2026-05-30): filterOwner も props で受け取り、 scope/ownerUserId を切替。
//   - filterOwner === selfUserId → scope='mine'
//   - filterOwner === <他ユーザー ID> → ownerUserId=<他ユーザー>
//   - filterOwner === undefined → 全員 (scope / ownerUserId なし)
// タグ / カテゴリ / showDelegated は client side で適用するため、 ここでは扱わない。
import { useTasks } from '@/features/tasks/hooks/useTasks';

export interface UseCalendarTasksOpts {
  from: string;
  to: string;
  selfUserId: string;
  filterOwner: string | undefined;
}

export function useCalendarTasks(opts: UseCalendarTasksOpts) {
  const isMine = opts.filterOwner === opts.selfUserId;
  const ownerUserId =
    opts.filterOwner && opts.filterOwner !== opts.selfUserId
      ? opts.filterOwner
      : undefined;
  return useTasks({
    scope: isMine ? 'mine' : undefined,
    ownerUserId,
    dateFilter: { mode: 'range', from: opts.from, to: opts.to },
  });
}
