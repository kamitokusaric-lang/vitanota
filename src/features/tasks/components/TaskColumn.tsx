// カンバン 1 カラム = 1 カテゴリ分
import type { TaskCategory } from '@/db/schema';
import { TaskCard } from './TaskCard';
import type { TaskWithOwner } from '../hooks/useTasks';

interface TaskColumnProps {
  category: TaskCategory;
  tasks: TaskWithOwner[];
  selfUserId: string;
  onAdd: (categoryId: string) => void;
  onEdit: (task: TaskWithOwner) => void;
  onStatusChange: (id: string, status: 'todo' | 'in_progress' | 'done') => void;
}

export function TaskColumn({
  category,
  tasks,
  selfUserId,
  onAdd,
  onEdit,
  onStatusChange,
}: TaskColumnProps) {
  return (
    <div
      className="flex-1 min-w-[220px] rounded-vn border border-vn-border bg-vn-bg p-3"
      data-testid={`task-column-${category.id}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">{category.name}</h3>
        <span className="text-xs text-gray-400">{tasks.length}</span>
      </div>
      <div className="space-y-2">
        {tasks.map((task) => {
          const isMine = task.ownerUserId === selfUserId;
          const delegated = !isMine && task.createdBy === selfUserId;
          return (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={onEdit}
              onStatusChange={onStatusChange}
              readonly={!isMine}
              delegated={delegated}
            />
          );
        })}
        <button
          type="button"
          onClick={() => onAdd(category.id)}
          className="w-full rounded border border-dashed border-gray-300 bg-white py-2 text-xs text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700"
          data-testid={`task-column-add-${category.id}`}
        >
          + 追加
        </button>
      </div>
    </div>
  );
}
