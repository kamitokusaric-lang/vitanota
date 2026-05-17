// AI 生成結果の表示モーダル + 直接編集 UI。
//
// 構成:
//   - summary (1 行)
//   - 「今日やる」セクション (タスクリスト + reason / suggested_action)
//     各カードに [今日やらない] [余裕があれば] ボタン
//   - 「余裕があれば」セクション
//     各カードに [今日やらない] [今日やる] ボタン
//   - 主ボタン: 「この内容で今日を始める」
//
// 設計憲法: 命令しない、評価しない、軽い語彙。

import { useEffect, useState } from 'react';
import { Modal } from '@/shared/components/Modal';
import { AddTaskModal } from './AddTaskModal';
import { TaskEditModal } from '@/features/tasks/components/TaskEditModal';
import { useOnboardingState } from '@/features/onboarding/hooks/useOnboardingState';
import {
  PlanResultButtonsHint,
  PLAN_RESULT_BUTTONS_HINT_VERSION,
} from '@/features/onboarding/PlanResultButtonsHint';
import {
  PlanResultStartHint,
  PLAN_RESULT_START_HINT_VERSION,
} from '@/features/onboarding/PlanResultStartHint';
import type { Bucket, GeneratedPlanItem, NotShownCandidate } from './types';

type EditTarget = Bucket | 'excluded';

interface Props {
  open: boolean;
  sessionId: string | null;
  selfUserId: string;
  summary: string;
  today: GeneratedPlanItem[];
  optional: GeneratedPlanItem[];
  notShown: NotShownCandidate[];
  todayIso: string;
  onStart: () => Promise<void> | void;
  onMoveItem: (taskId: string, toBucket: EditTarget) => Promise<void> | void;
  onAddTask: (taskId: string) => Promise<void> | void;
  onMarkTaskDone: (taskId: string) => Promise<void> | void;
  onClose: () => void;
  starting?: boolean;
  // 編集モーダルでタスクが更新/削除されたら親で plan を再 fetch する
  onTaskMutated?: () => void;
}

export function PlanResultModal({
  open,
  sessionId,
  selfUserId,
  summary,
  today,
  optional,
  notShown,
  todayIso,
  onStart,
  onMoveItem,
  onAddTask,
  onMarkTaskDone,
  onClose,
  starting,
  onTaskMutated,
}: Props) {
  // ローカル state (常時編集可、parent には API 経由で反映)
  // 'excluded' したものは local state から取り除く
  const [items, setItems] = useState<Array<GeneratedPlanItem & { bucket: Bucket }>>(
    [],
  );
  const [addCandidates, setAddCandidates] = useState<NotShownCandidate[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  // 3 ボタンナビ (chimo 2026-05-17): 1 回の dismiss で 3 つ一括非表示
  const {
    shouldShow: shouldShowButtonsHint,
    markDismissed: markButtonsHintDismissed,
  } = useOnboardingState(
    'plan_result_buttons_hint',
    PLAN_RESULT_BUTTONS_HINT_VERSION,
  );
  const dismissButtonsHint = (reason: 'close_button' | 'cta_click') => {
    void fetch('/api/ai-chat/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'plan_result_buttons_hint_dismissed',
        reason,
        version: PLAN_RESULT_BUTTONS_HINT_VERSION,
      }),
    }).catch(() => undefined);
    void markButtonsHintDismissed(1).catch(() => undefined);
  };

  // 「今日の仕事を始める」CTA ナビ (chimo 2026-05-17)
  const {
    shouldShow: shouldShowStartHint,
    markDismissed: markStartHintDismissed,
  } = useOnboardingState(
    'plan_result_start_hint',
    PLAN_RESULT_START_HINT_VERSION,
  );
  const dismissStartHint = (reason: 'close_button' | 'cta_click') => {
    void fetch('/api/ai-chat/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'plan_result_start_hint_dismissed',
        reason,
        version: PLAN_RESULT_START_HINT_VERSION,
      }),
    }).catch(() => undefined);
    void markStartHintDismissed(1).catch(() => undefined);
  };

  // sessionId が変わったら local state を初期化
  useEffect(() => {
    setItems([
      ...today.map((i) => ({ ...i, bucket: 'today' as Bucket })),
      ...optional.map((i) => ({ ...i, bucket: 'optional' as Bucket })),
    ]);
    setAddCandidates(notShown);
    setAddModalOpen(false);
    setProcessedMap(new Map());
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const todayItems = items.filter((i) => i.bucket === 'today');
  const optionalItems = items.filter((i) => i.bucket === 'optional');

  const move = async (taskId: string, to: EditTarget) => {
    if (to === 'excluded') {
      setItems((prev) => prev.filter((i) => i.task_id !== taskId));
    } else {
      setItems((prev) =>
        prev.map((i) => (i.task_id === taskId ? { ...i, bucket: to } : i)),
      );
    }
    await onMoveItem(taskId, to);
  };

  // 「完了にする」: tasks.status='done' に更新 + リストから消す
  const markDone = async (taskId: string) => {
    setItems((prev) => prev.filter((i) => i.task_id !== taskId));
    await onMarkTaskDone(taskId);
  };

  // 「追加した / 完了にした」候補の状態 (AddTaskModal の row は残して視覚フィードバックを保持)
  const [processedMap, setProcessedMap] = useState<Map<string, 'added' | 'done'>>(
    new Map(),
  );

  const handleAdd = async (taskId: string) => {
    const candidate = addCandidates.find((c) => c.taskId === taskId);
    if (!candidate) return;
    // local state に「今日やる」として即追加 (reason / suggested_action は空)
    setItems((prev) => [
      ...prev,
      {
        task_id: candidate.taskId,
        reason: '',
        suggested_action: '',
        confidence: 0,
        title: candidate.title,
        dueDate: candidate.dueDate,
        categoryName: candidate.categoryName,
        description: '',
        status: '',
        assigneeNames: [],
        bucket: 'today' as Bucket,
      },
    ]);
    setProcessedMap((prev) => {
      const next = new Map(prev);
      next.set(taskId, 'added');
      return next;
    });
    await onAddTask(taskId);
  };

  const handleMarkDone = async (taskId: string) => {
    setProcessedMap((prev) => {
      const next = new Map(prev);
      next.set(taskId, 'done');
      return next;
    });
    await onMarkTaskDone(taskId);
  };

  const remainingCandidateCount = addCandidates.filter(
    (c) => !processedMap.has(c.taskId),
  ).length;

  return (
    <Modal open={open} onClose={onClose} title="今日の見通し案" maxWidth="max-w-2xl">
      <p className="mb-3 text-sm text-slate-600">
        {summary && (
          <>
            {summary}
            <br />
          </>
        )}
        タスクを入れ替えたり、「今日やらない」を選んでも大丈夫です。
      </p>

      {/* アクションバー: スクロールしても常に上に貼り付く (タスクが多くても埋もれない) */}
      <div className="sticky top-0 z-10 -mx-6 mb-4 border-b border-slate-100 bg-white/95 px-6 py-3 backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            disabled={remainingCandidateCount === 0}
            data-testid="plan-result-add-task-button"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-sm font-medium text-slate-600 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            + 今日やることに別のタスクを追加する
            {remainingCandidateCount > 0 && (
              <span className="ml-2 text-[11px] text-slate-400">
                ({remainingCandidateCount})
              </span>
            )}
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (shouldShowStartHint) dismissStartHint('cta_click');
                void onStart();
              }}
              disabled={!sessionId || starting}
              data-testid="plan-result-start-button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-indigo-600 px-5 text-sm font-medium text-white shadow-[0_4px_10px_rgba(79,70,229,0.18)] transition hover:-translate-y-0.5 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {starting ? '始めています…' : 'このタスクで今日の仕事を始める'}
            </button>
            {shouldShowStartHint && (
              <PlanResultStartHint
                onDismiss={(reason) => dismissStartHint(reason)}
              />
            )}
          </div>
        </div>
      </div>

      <PlanList
        label="今日やる"
        items={todayItems}
        onMove={move}
        onMarkDone={markDone}
        onOpenDetail={(i) => setEditingTaskId(i.task_id)}
        currentBucket="today"
        emptyText="今日やるは空です"
        showButtonsHintOnFirstCard={shouldShowButtonsHint}
        onDismissButtonsHint={dismissButtonsHint}
      />
      <PlanList
        label="余裕があれば"
        items={optionalItems}
        onMove={move}
        onMarkDone={markDone}
        onOpenDetail={(i) => setEditingTaskId(i.task_id)}
        currentBucket="optional"
        emptyText="余裕があればは空です"
      />


      <AddTaskModal
        open={addModalOpen}
        candidates={addCandidates}
        processedMap={processedMap}
        todayIso={todayIso}
        onAdd={handleAdd}
        onMarkDone={handleMarkDone}
        onClose={() => setAddModalOpen(false)}
      />

      <TaskEditModal
        taskId={editingTaskId}
        selfUserId={selfUserId}
        onClose={() => setEditingTaskId(null)}
        onUpdated={() => onTaskMutated?.()}
        onDeleted={() => onTaskMutated?.()}
      />

    </Modal>
  );
}

function PlanList({
  label,
  items,
  onMove,
  onMarkDone,
  onOpenDetail,
  currentBucket,
  emptyText,
  showButtonsHintOnFirstCard,
  onDismissButtonsHint,
}: {
  label: string;
  items: Array<GeneratedPlanItem & { bucket: Bucket }>;
  onMove: (taskId: string, to: EditTarget) => Promise<void> | void;
  onMarkDone: (taskId: string) => Promise<void> | void;
  onOpenDetail: (item: GeneratedPlanItem) => void;
  currentBucket: Bucket;
  emptyText: string;
  // 「今日やる」セクションの 1 番目のカードのみ表示するナビ用フラグ
  showButtonsHintOnFirstCard?: boolean;
  onDismissButtonsHint?: (reason: 'close_button' | 'cta_click') => void;
}) {
  // 反対 bucket への移動先
  const otherBucket: Bucket = currentBucket === 'today' ? 'optional' : 'today';
  const otherLabel =
    otherBucket === 'today' ? '今日やる' : '余裕があれば';

  return (
    <section
      className={
        'mb-4 ' +
        (currentBucket === 'optional'
          ? 'rounded-xl bg-amber-100 p-3'
          : '')
      }
    >
      <h3 className="mb-2 text-sm font-semibold text-slate-700">{label}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i, idx) => {
            const isFirstCard = idx === 0;
            const showHint =
              isFirstCard && !!showButtonsHintOnFirstCard;
            return (
              <li
                key={i.task_id}
                className="rounded-xl border border-slate-200 bg-white p-3"
                data-testid={`plan-result-item-${i.task_id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <button
                      type="button"
                      onClick={() => onOpenDetail(i)}
                      data-testid={`plan-result-item-title-${i.task_id}`}
                      className="text-left text-sm font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-2 transition hover:text-indigo-900 hover:decoration-indigo-700"
                    >
                      {i.title}
                    </button>
                    {i.dueDate && (
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        期限: {i.dueDate}
                      </div>
                    )}
                    {i.reason && (() => {
                      const todayIsoLocal = new Date().toISOString().slice(0, 10);
                      const isOverdue = !!i.dueDate && i.dueDate < todayIsoLocal;
                      return (
                        <p
                          className={
                            'mt-1.5 text-xs leading-relaxed ' +
                            (isOverdue
                              ? 'font-medium text-red-600'
                              : 'text-slate-600')
                          }
                        >
                          {i.reason}
                        </p>
                      );
                    })()}
                    {i.suggested_action && (
                      <p className="mt-1 text-xs text-slate-500">
                        最初の一歩: {i.suggested_action}
                      </p>
                    )}
                  </div>
                  <div
                    className="flex shrink-0 flex-col gap-1.5"
                    data-testid={`plan-result-buttons-${i.task_id}`}
                  >
                    {showHint && onDismissButtonsHint && (
                      <PlanResultButtonsHint
                        anchorSelector={`[data-testid="plan-result-buttons-${i.task_id}"]`}
                        onDismiss={(reason) => onDismissButtonsHint(reason)}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (showHint && onDismissButtonsHint) {
                          onDismissButtonsHint('cta_click');
                        }
                        void onMove(i.task_id, otherBucket);
                      }}
                      data-testid={`plan-result-item-move-${i.task_id}`}
                      className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      {otherLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (showHint && onDismissButtonsHint) {
                          onDismissButtonsHint('cta_click');
                        }
                        void onMove(i.task_id, 'excluded');
                      }}
                      data-testid={`plan-result-item-exclude-${i.task_id}`}
                      className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-500 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      今日やらない
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (showHint && onDismissButtonsHint) {
                          onDismissButtonsHint('cta_click');
                        }
                        void onMarkDone(i.task_id);
                      }}
                      data-testid={`plan-result-item-mark-done-${i.task_id}`}
                      className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-500 transition hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700"
                    >
                      完了にする
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
