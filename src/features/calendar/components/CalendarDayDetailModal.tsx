// 月セル / 週セル / 「+N 件」 をクリックしたとき開く、 その日のタスク一覧モーダル。
// TaskCard クリック → onEditTask で編集モーダルが上に重なる (Portal なので入れ子 OK)。
import { Modal } from '@/shared/components/Modal';
import { TaskCard } from '@/features/tasks/components/TaskCard';
import type { TaskWithAssignees } from '@/features/tasks/hooks/useTasks';

interface CalendarDayDetailModalProps {
  open: boolean;
  date: string | null;
  tasks: TaskWithAssignees[];
  onClose: () => void;
  onEditTask?: (task: TaskWithAssignees) => void;
}

const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

function formatDateTitle(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${m}/${d} (${WEEK_LABELS[date.getDay()]}) のタスク`;
}

function dueDateToYmd(value: string | Date | null): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

// 並び: 未完了優先 → dueDate 昇順 → createdAt 昇順
function sortForModal(tasks: TaskWithAssignees[]): TaskWithAssignees[] {
  return [...tasks].sort((a, b) => {
    const aDone = a.status === 'done' ? 1 : 0;
    const bDone = b.status === 'done' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const aDue = dueDateToYmd(a.dueDate) ?? '9999-99-99';
    const bDue = dueDateToYmd(b.dueDate) ?? '9999-99-99';
    if (aDue !== bDue) return aDue < bDue ? -1 : 1;
    const aCreated =
      typeof a.createdAt === 'string' ? a.createdAt : a.createdAt.toISOString();
    const bCreated =
      typeof b.createdAt === 'string' ? b.createdAt : b.createdAt.toISOString();
    return aCreated < bCreated ? -1 : aCreated > bCreated ? 1 : 0;
  });
}

export function CalendarDayDetailModal({
  open,
  date,
  tasks,
  onClose,
  onEditTask,
}: CalendarDayDetailModalProps) {
  const sorted = sortForModal(tasks);
  const title = date ? formatDateTitle(date) : '';
  const handleEdit = (task: TaskWithAssignees) => {
    if (onEditTask) onEditTask(task);
  };

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-lg">
      <div
        className="flex flex-col gap-2"
        data-testid="calendar-day-detail-modal-content"
      >
        {sorted.length === 0 ? (
          <p
            className="py-6 text-center text-[13px] text-slate-500"
            data-testid="calendar-day-detail-empty"
          >
            この日のタスクはありません
          </p>
        ) : (
          sorted.map((task) => (
            <TaskCard key={task.id} task={task} onEdit={handleEdit} />
          ))
        )}
      </div>
    </Modal>
  );
}
