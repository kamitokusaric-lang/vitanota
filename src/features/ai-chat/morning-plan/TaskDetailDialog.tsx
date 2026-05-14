// タスク詳細を表示する読み専用モーダル。
// PlanResultModal (朝の整理時) / TodayPlanView (日中表示) の両方から使う。

import { Modal } from '@/shared/components/Modal';

export interface TaskDetailViewModel {
  title: string;
  dueDate: string | null;
  categoryName: string | null;
  status: string;
  description: string;
  assigneeNames: string[];
  reason?: string;
  suggestedAction?: string;
}

interface Props {
  item: TaskDetailViewModel | null;
  onClose: () => void;
}

export function TaskDetailDialog({ item, onClose }: Props) {
  return (
    <Modal
      open={item !== null}
      onClose={onClose}
      title={item?.title ?? ''}
      maxWidth="max-w-lg"
    >
      {item && (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>期限: {item.dueDate ?? '—'}</span>
            <span>カテゴリ: {item.categoryName ?? '—'}</span>
            <span>状態: {item.status || '—'}</span>
            {item.assigneeNames.length > 0 && (
              <span>担当: {item.assigneeNames.join(' / ')}</span>
            )}
          </div>
          {item.description ? (
            <div>
              <div className="text-[11px] font-semibold text-slate-500">詳細</div>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                {item.description}
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-400">タスク詳細はありません</p>
          )}
          {(item.reason || item.suggestedAction) && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
              <div className="text-[11px] font-semibold text-indigo-700">
                AI からの見方
              </div>
              {item.reason && (
                <p className="mt-1 text-xs text-slate-700">{item.reason}</p>
              )}
              {item.suggestedAction && (
                <p className="mt-1 text-xs text-slate-600">
                  最初の一歩: {item.suggestedAction}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
        >
          閉じる
        </button>
      </div>
    </Modal>
  );
}
