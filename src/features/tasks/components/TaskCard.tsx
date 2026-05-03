// カンバン上の個別タスクカード
// delegated: 自分が作成したが owner が他人のタスク (色違い表示、「あの先生に振ったやつ」を識別)
// ステータス変更は (1) 編集モーダル の status select、または (2) 横方向ドラッグ&ドロップ で行う。
import type { TaskWithOwner } from '../hooks/useTasks';

interface TaskCardProps {
  task: TaskWithOwner;
  onEdit: (task: TaskWithOwner) => void;
  delegated?: boolean;
  onDragStart?: (taskId: string) => void;
  onDragEnd?: () => void;
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
  delegated = false,
  onDragStart,
  onDragEnd,
}: TaskCardProps) {
  const draggable = !!onDragStart;
  const cardClass = [
    'rounded-md border border-gray-200 bg-white p-3 text-sm shadow-sm transition-opacity',
    task.status === 'done' ? 'opacity-60' : '',
    // delegated (= 自分が振ったが他人が owner) は左側に amber のアクセントと淡い背景
    delegated ? 'border-l-4 border-l-amber-400 bg-amber-50/40' : '',
    draggable ? 'cursor-grab active:cursor-grabbing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cardClass}
      data-testid={`task-card-${task.id}`}
      draggable={draggable}
      onDragStart={(e) => {
        if (!onDragStart) return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/task-id', task.id);
        onDragStart(task.id);
      }}
      onDragEnd={() => onDragEnd?.()}
    >
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
        {task.tags.length > 0 && (
          <div
            className="mt-1.5 flex flex-wrap gap-1"
            data-testid={`task-card-tags-${task.id}`}
          >
            {task.tags.map((tg) => (
              <span
                key={tg.id}
                className="inline-flex rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700"
              >
                #{tg.name}
              </span>
            ))}
          </div>
        )}
      </button>
    </div>
  );
}
