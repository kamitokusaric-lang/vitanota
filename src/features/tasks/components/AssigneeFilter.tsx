// タスクの絞込 (全員 / 自分 / 特定教員)
import type { Assignee } from '../hooks/useAssignees';

interface AssigneeFilterProps {
  value: string | undefined; // undefined = 全員 / userId = 特定ユーザー
  onChange: (value: string | undefined) => void;
  assignees: Assignee[];
  selfUserId: string;
}

export function AssigneeFilter({
  value,
  onChange,
  assignees,
  selfUserId,
}: AssigneeFilterProps) {
  const currentValue = value ?? '__all__';
  const others = assignees.filter((a) => a.userId !== selfUserId);

  return (
    <label className="flex items-center gap-2 text-xs text-gray-600">
      <span>担当者:</span>
      <select
        value={currentValue}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next === '__all__' ? undefined : next);
        }}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
        data-testid="assignee-filter-select"
      >
        <option value="__all__">全員</option>
        <option value={selfUserId}>自分</option>
        {others.map((a) => (
          <option key={a.userId} value={a.userId}>
            {a.name ?? a.email}
          </option>
        ))}
      </select>
    </label>
  );
}
