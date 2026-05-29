// Phase 7 (chimo 2026-05-30): tag / category / showDelegated を client side で
// 適用する純関数。 TaskBoard 内既存ロジックと同 pattern (TaskBoard.tsx 内 filteredTasks)。
// useTasks の dateFilter / scope は server side で絞ってくる前提。
import type { TaskWithAssignees } from '@/features/tasks/hooks/useTasks';
import type { SharedFilters } from '@/features/tasks/components/TaskBoard';

export function applyClientSideFilters(
  tasks: TaskWithAssignees[],
  filters: SharedFilters,
  selfUserId: string,
): TaskWithAssignees[] {
  const categoryFilterSet = new Set(filters.filterCategoryIds);
  const tagFilterSet = new Set(filters.filterTagIds);
  return tasks.filter((t) => {
    if (categoryFilterSet.size > 0 && !categoryFilterSet.has(t.categoryId)) {
      return false;
    }
    if (
      tagFilterSet.size > 0 &&
      !t.tags.some((tg) => tagFilterSet.has(tg.id))
    ) {
      return false;
    }
    if (filters.filterOwner === selfUserId && !filters.showDelegated) {
      // delegated = 自分が依頼したが assignees に自分が含まれない (= お願いした側)
      const isMine = t.assignees.some((a) => a.userId === selfUserId);
      if (t.createdBy === selfUserId && !isMine) return false;
    }
    return true;
  });
}
