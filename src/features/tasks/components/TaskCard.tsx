// カンバン上の個別タスクカード
// readonly: 他人のタスク (閲覧のみ可、ステータス変更不可)
// delegated: 自分が作成したが owner が他人のタスク (色違い表示、「あの先生に振ったやつ」を識別)
import type { TaskWithOwner } from '../hooks/useTasks';

interface TaskCardProps {
  task: TaskWithOwner;
  onEdit: (task: TaskWithOwner) => void;
  onStatusChange: (id: string, status: 'todo' | 'in_progress' | 'done') => void;
  readonly?: boolean;
  delegated?: boolean;
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

function isDueToday(value: string | Date): boolean {
  const d = typeof value === 'string' ? new Date(value) : value;
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

export function TaskCard({
  task,
  onEdit,
  onStatusChange,
  readonly = false,
  delegated = false,
}: TaskCardProps) {
  const cardClass = [
    'rounded-md border border-gray-200 bg-white p-3 text-sm shadow-sm transition-opacity',
    task.status === 'done' ? 'opacity-60' : '',
    // delegated (= 自分が振ったが他人が owner) は左側に amber のアクセントと淡い背景
    delegated ? 'border-l-4 border-l-amber-400 bg-amber-50/40' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cardClass} data-testid={`task-card-${task.id}`}>
      <button
        type="button"
        onClick={() => onEdit(task)}
        className="block w-full text-left"
        data-testid={`task-card-edit-${task.id}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div
            className={`flex-1 font-medium text-gray-900 ${
              task.status === 'done' ? 'line-through' : ''
            }`}
          >
            {task.title}
          </div>
          {delegated && (
            <span
              className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800"
              data-testid={`task-card-delegated-${task.id}`}
            >
              依頼中
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          {(task.ownerNickname ?? task.ownerName) && (
            <span>
              {delegated && <span className="text-amber-700">→ </span>}
              {task.ownerNickname ?? task.ownerName}
            </span>
          )}
          {task.dueDate && (
            <span
              className={
                isDueToday(task.dueDate)
                  ? 'inline-flex items-center gap-1 font-semibold text-vn-red'
                  : undefined
              }
              data-testid={
                isDueToday(task.dueDate)
                  ? `task-card-due-today-${task.id}`
                  : undefined
              }
            >
              {isDueToday(task.dueDate) && (
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-vn-red" />
              )}
              期限: {formatDate(task.dueDate)}
            </span>
          )}
          {task.commentCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-gray-500"
              data-testid={`task-card-comment-count-${task.id}`}
            >
              💬 {task.commentCount}
            </span>
          )}
        </div>
      </button>
      <button
        type="button"
        disabled={readonly}
        onClick={(e) => {
          e.stopPropagation();
          if (readonly) return;
          onStatusChange(task.id, nextStatus(task.status));
        }}
        className={`mt-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[task.status]} ${
          readonly ? 'cursor-default opacity-80' : ''
        }`}
        data-testid={`task-card-status-${task.id}`}
      >
        {STATUS_LABEL[task.status]}
      </button>
    </div>
  );
}
