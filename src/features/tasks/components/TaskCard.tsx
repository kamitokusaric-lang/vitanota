// カンバン上の個別タスクカード
// delegated: 自分が作成したが assignees に自分が含まれないタスク (色違い表示、「あの先生に振ったやつ」を識別)
// ステータス変更は (1) 編集モーダル の status select、または (2) 横方向ドラッグ&ドロップ で行う。
import type { TaskAssigneeSummary, TaskWithAssignees } from '../hooks/useTasks';

interface TaskCardProps {
  task: TaskWithAssignees;
  onEdit: (task: TaskWithAssignees) => void;
  delegated?: boolean;
  // 「全員」フィルタ時に自分のタスクを薄い黄色で識別するためのフラグ
  mineHighlight?: boolean;
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

function displayName(a: TaskAssigneeSummary): string {
  return a.nickname ?? a.name ?? '';
}

// 3 名以下は全員、4 名以上は「田中, 佐藤 +N」(最初の 2 名 + 残り件数)
function formatAssignees(assignees: TaskAssigneeSummary[]): string {
  if (assignees.length === 0) return '';
  if (assignees.length <= 3) {
    return assignees.map(displayName).filter(Boolean).join(', ');
  }
  const head = assignees.slice(0, 2).map(displayName).filter(Boolean).join(', ');
  return `${head} +${assignees.length - 2}`;
}

export function TaskCard({
  task,
  onEdit,
  delegated = false,
  mineHighlight = false,
  onDragStart,
  onDragEnd,
}: TaskCardProps) {
  const draggable = !!onDragStart;
  // 背景色の決定: delegated > mineHighlight > 通常 (delegated と mineHighlight は assignees の包含で排他)
  const bgClass = delegated
    ? 'bg-amber-50/40'
    : mineHighlight
      ? 'bg-yellow-50'
      : 'bg-white';
  // chimo スケール: padding 14/16、Radius 10、Border 1px #EAEAEA、shadow なし
  const cardClass = [
    'rounded-[10px] border border-vn-border px-4 py-3.5 transition-opacity',
    bgClass,
    task.status === 'done' ? 'opacity-60' : '',
    // delegated (= 自分が振ったが assignees に自分が含まれない) は左側に amber のアクセント
    delegated ? 'border-l-4 border-l-amber-400' : '',
    draggable ? 'cursor-grab active:cursor-grabbing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const assigneesLabel = formatAssignees(task.assignees);

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
          {/* chimo: タイトル 15px / 600 / #111 / line-height 1.4、下 6px */}
          <div
            className={`flex-1 text-base font-medium leading-[1.4] text-gray-900 ${
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

        {/* chimo: 担当者は本文相当 13px / 400 / #555 / line-height 1.5 / 上 6px */}
        {assigneesLabel && (
          <div className="mt-1.5 text-[13px] leading-[1.5] text-gray-600">
            {delegated && <span className="text-amber-700">→ </span>}
            {assigneesLabel}
          </div>
        )}

        {/* chimo: 期限・補助メタは 12px / 400 / #777 / line-height 1.4 / 上 2px */}
        {(task.dueDate || task.commentCount > 0) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs leading-[1.4] text-gray-500">
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
                className="inline-flex items-center gap-0.5"
                data-testid={`task-card-comment-count-${task.id}`}
              >
                💬 {task.commentCount}
              </span>
            )}
          </div>
        )}

        {/* chimo: タグは "見つけられる" 程度の弱さ。本文群と 8px 離して情報の塊を切る */}
        {task.tags.length > 0 && (
          <div
            className="mt-2 flex flex-wrap gap-1"
            data-testid={`task-card-tags-${task.id}`}
          >
            {task.tags.map((tg) => (
              <span
                key={tg.id}
                className="inline-flex rounded-md bg-vn-muted-bg px-1.5 py-[3px] text-xs font-medium text-gray-600"
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
