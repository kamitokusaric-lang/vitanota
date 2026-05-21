// カンバン上の個別タスクカード
// delegated: 自分が作成したが assignees に自分が含まれないタスク (色違い表示、「あの先生に振ったやつ」を識別)
// ステータス変更は (1) 編集モーダル の status select、または (2) 横方向ドラッグ&ドロップ で行う。
import type { TaskAssigneeSummary, TaskWithAssignees } from '../hooks/useTasks';

interface TaskCardProps {
  task: TaskWithAssignees;
  onEdit: (task: TaskWithAssignees) => void;
  delegated?: boolean;
  // 「全員」フィルタ時に自分のタスクを薄い黄色 + 左の赤ラインで識別するためのフラグ
  mineHighlight?: boolean;
  // 縦軸 grouping 廃止に伴い、 カード上端にカテゴリ chip を出す (chimo 2026-05-20)
  categoryName?: string;
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

// 期限切れ判定: due_date が今日 (00:00) より前。 status='done' のチェックは呼び元で行う。
function isOverdue(value: string | Date): boolean {
  const d = typeof value === 'string' ? new Date(value) : value;
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return due.getTime() < today.getTime();
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
  categoryName,
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
  // chimo 2026-05-20: padding 14/14/12、 Radius 10、 Border 1px slate-200、 shadow 軽め
  const cardClass = [
    'rounded-[10px] border border-vn-border px-3.5 pb-3 pt-3.5 shadow-[0_2px_8px_rgba(15,23,42,0.035)] transition-opacity',
    bgClass,
    task.status === 'done' ? 'opacity-60' : '',
    // delegated (= 自分が振ったが assignees に自分が含まれない) は左側に amber のアクセント
    delegated ? 'border-l-4 border-l-amber-400' : '',
    // 「全員」フィルタ時に自分のタスクは左側に赤のアクセント
    mineHighlight ? 'border-l-4 border-l-vn-red' : '',
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
        {/* chimo 2026-05-21: カテゴリ表示は「今日の記録」 pill と同じ白 + slate border 系に統一。
            ただし表示のみで非クリック → hover 効果なし、 サイズはカード内なので h-6 / 11px / 700。 */}
        {categoryName && (
          <div
            className="mb-2 inline-flex h-6 items-center rounded-full border border-vn-border-strong bg-white px-2.5 text-[11px] font-medium leading-none text-slate-700"
            data-testid={`task-card-category-${task.id}`}
          >
            {categoryName}
          </div>
        )}
        <div className="flex items-start justify-between gap-2">
          {/* chimo 2026-05-20 final-tune: タイトル 14px / 600 / slate-700 / line-height 1.55、下 8px
              (slate-800 だとボード全体が黒く見えるため 1 段淡く) */}
          <div
            className={`mb-2 flex-1 text-[14px] font-semibold leading-[1.55] text-slate-700 ${
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

        {/* chimo 2026-05-20 font-tune: 担当者は 12px / 400 / slate-500 (圧を落とす) */}
        {assigneesLabel && (
          <div className="text-[12px] font-normal leading-[1.5] text-slate-500">
            {delegated && <span className="text-amber-700">→ </span>}
            {assigneesLabel}
          </div>
        )}

        {/* chimo 2026-05-21: 期限は 12px / 600。
            赤マーク (赤ドット + 赤文字) 条件: 今日期限 OR (期限切れ かつ 未完了)。
            完了済みタスクは赤化しない (= 過去の done が全部赤になるのを防ぐ)。 */}
        {(task.dueDate ||
          task.commentCount > 0 ||
          (task.status === 'done' && task.completedAt)) && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] font-semibold leading-[1.4]">
            {task.dueDate &&
              (() => {
                const dueToday = isDueToday(task.dueDate);
                const overdueActive =
                  isOverdue(task.dueDate) && task.status !== 'done';
                // chimo 2026-05-21: 期限切れ = 赤 (警告)、 今日期限 = 青 (注意喚起) で区別
                const dotClass = overdueActive
                  ? 'bg-red-600'
                  : dueToday
                    ? 'bg-vn-accent'
                    : '';
                const textClass = overdueActive
                  ? 'inline-flex items-center gap-1 text-red-600'
                  : dueToday
                    ? 'inline-flex items-center gap-1 text-vn-accent'
                    : 'text-slate-500';
                return (
                  <span
                    className={textClass}
                    data-testid={
                      dueToday
                        ? `task-card-due-today-${task.id}`
                        : overdueActive
                          ? `task-card-due-overdue-${task.id}`
                          : undefined
                    }
                  >
                    {dotClass && (
                      <span
                        aria-hidden
                        className={`h-1.5 w-1.5 rounded-full ${dotClass}`}
                      />
                    )}
                    期限: {formatDate(task.dueDate)}
                  </span>
                );
              })()}
            {task.status === 'done' && task.completedAt && (
              <span
                className="text-slate-500"
                data-testid={`task-card-completed-${task.id}`}
              >
                完了: {formatDate(task.completedAt)}
              </span>
            )}
            {task.commentCount > 0 && (
              <span
                className="inline-flex items-center gap-0.5 text-slate-500"
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
