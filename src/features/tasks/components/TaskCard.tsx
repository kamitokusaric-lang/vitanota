// カンバン上の個別タスクカード
// カードクリックで編集モーダル、status バッジクリックでステータス前進 (todo → 進行中 → 完了 → todo)
import type { TaskWithOwner } from '../hooks/useTasks';

interface TaskCardProps {
  task: TaskWithOwner;
  onEdit: (task: TaskWithOwner) => void;
  onStatusChange: (id: string, status: 'todo' | 'in_progress' | 'done') => void;
}

const STATUS_LABEL: Record<'todo' | 'in_progress' | 'done', string> = {
  todo: '未着手',
  in_progress: '進行中',
  done: '完了',
};

const STATUS_STYLE: Record<'todo' | 'in_progress' | 'done', string> = {
  todo: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
};

function nextStatus(status: 'todo' | 'in_progress' | 'done') {
  if (status === 'todo') return 'in_progress' as const;
  if (status === 'in_progress') return 'done' as const;
  return 'todo' as const;
}

function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
  }).format(date);
}

export function TaskCard({ task, onEdit, onStatusChange }: TaskCardProps) {
  return (
    <div
      className={`rounded-md border border-gray-200 bg-white p-3 text-sm shadow-sm transition-opacity ${
        task.status === 'done' ? 'opacity-60' : ''
      }`}
      data-testid={`task-card-${task.id}`}
    >
      <button
        type="button"
        onClick={() => onEdit(task)}
        className="block w-full text-left"
        data-testid={`task-card-edit-${task.id}`}
      >
        <div
          className={`font-medium text-gray-900 ${
            task.status === 'done' ? 'line-through' : ''
          }`}
        >
          {task.title}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
          {task.ownerName && <span>{task.ownerName}</span>}
          {task.dueDate && <span>期限: {formatDate(task.dueDate)}</span>}
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onStatusChange(task.id, nextStatus(task.status));
        }}
        className={`mt-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[task.status]}`}
        data-testid={`task-card-status-${task.id}`}
      >
        {STATUS_LABEL[task.status]}
      </button>
    </div>
  );
}
