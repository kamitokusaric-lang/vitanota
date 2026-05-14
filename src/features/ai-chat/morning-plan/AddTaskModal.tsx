// AI 提案に含まれなかった自分のタスクを「今日やる」に追加するモーダル。
//
// 並び順 (chimo 2026-05-14 指示):
//   1. 期限切れ (今日より前で未完了) — 最優先で表示
//   2. 期限が今日〜明後日 (today 起点で +0〜+2 日)
//   3. 期限未入力
//   4. その他 (期限が +3 日以降)
//   各グループ内は期限近い順、期限なしはタイトル昇順。
//
// 各カードに 2 ボタン:
//   - 「今日やる」: PlanResultModal の今日やるセクションに追加
//   - 「完了にする」: 既に終わってるタスクを tasks.status='done' に更新
// どちらの操作後も候補リストから外す。連続操作のためモーダルは閉じない。

import { Modal } from '@/shared/components/Modal';
import type { NotShownCandidate } from './types';

type CandidateStatus = 'idle' | 'added' | 'done';

interface Props {
  open: boolean;
  candidates: NotShownCandidate[];
  processedMap: Map<string, 'added' | 'done'>;
  todayIso: string;
  onAdd: (taskId: string) => Promise<void> | void;
  onMarkDone: (taskId: string) => Promise<void> | void;
  onClose: () => void;
}

function rankByDueDate(due: string | null, todayIso: string): number {
  if (!due) return 2; // 期限未入力
  if (due < todayIso) return 0; // 期限切れ (= 過ぎているのに未完了)
  // due >= today
  const today = new Date(todayIso);
  const twoAfter = new Date(today);
  twoAfter.setDate(twoAfter.getDate() + 2);
  const y = twoAfter.getFullYear();
  const m = String(twoAfter.getMonth() + 1).padStart(2, '0');
  const d = String(twoAfter.getDate()).padStart(2, '0');
  const twoAfterIso = `${y}-${m}-${d}`;
  if (due <= twoAfterIso) return 1; // 今日〜明後日
  return 3; // それ以降
}

function sortCandidates(
  items: NotShownCandidate[],
  todayIso: string,
): NotShownCandidate[] {
  return [...items].sort((a, b) => {
    const ra = rankByDueDate(a.dueDate, todayIso);
    const rb = rankByDueDate(b.dueDate, todayIso);
    if (ra !== rb) return ra - rb;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.title.localeCompare(b.title);
  });
}

export function AddTaskModal({
  open,
  candidates,
  processedMap,
  todayIso,
  onAdd,
  onMarkDone,
  onClose,
}: Props) {
  const sorted = sortCandidates(candidates, todayIso);
  const remainingCount = sorted.filter((c) => !processedMap.has(c.taskId)).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="今日やることに追加する"
      maxWidth="max-w-xl"
    >
      <p className="mb-4 text-sm text-slate-600">
        AI 提案に含まれていない自分の未完了タスクです。「今日やる」に追加するか、
        もう終わっているなら「完了にする」を選んでください。
      </p>
      {sorted.length === 0 ? (
        <p className="text-sm text-slate-400">追加できるタスクはありません</p>
      ) : (
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
          {sorted.map((c) => {
            const status: CandidateStatus = processedMap.get(c.taskId) ?? 'idle';
            return (
              <CandidateRow
                key={c.taskId}
                candidate={c}
                status={status}
                todayIso={todayIso}
                onAdd={onAdd}
                onMarkDone={onMarkDone}
              />
            );
          })}
        </ul>
      )}
      <div className="mt-5 flex items-center justify-between">
        <span className="text-[11px] text-slate-400">
          {remainingCount > 0
            ? `残り ${remainingCount} 件`
            : 'すべて処理しました'}
        </span>
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

function CandidateRow({
  candidate: c,
  status,
  todayIso,
  onAdd,
  onMarkDone,
}: {
  candidate: NotShownCandidate;
  status: CandidateStatus;
  todayIso: string;
  onAdd: Props['onAdd'];
  onMarkDone: Props['onMarkDone'];
}) {
  const overdue = c.dueDate != null && c.dueDate < todayIso;

  return (
    <li
      data-testid={`add-task-modal-item-${c.taskId}`}
      className={
        'rounded-xl border p-3 transition-all duration-500 ' +
        (status === 'added'
          ? 'border-indigo-400 bg-indigo-50'
          : status === 'done'
            ? 'border-emerald-400 bg-emerald-50 opacity-60'
            : 'border-slate-200 bg-white')
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-sm font-medium text-slate-900">{c.title}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-slate-400">
            <span className={overdue ? 'font-medium text-amber-700' : ''}>
              期限: {c.dueDate ?? '—'}
              {overdue && ' (過ぎています)'}
            </span>
            <span>カテゴリ: {c.categoryName ?? '—'}</span>
          </div>
          {status === 'added' && (
            <p className="mt-1 text-[11px] font-medium text-indigo-700">
              ✓ 今日やるに追加しました
            </p>
          )}
          {status === 'done' && (
            <p className="mt-1 text-[11px] font-medium text-emerald-700">
              ✓ 完了にしました
            </p>
          )}
        </div>
        {status === 'idle' && (
          <div className="flex shrink-0 flex-col gap-1.5">
            <button
              type="button"
              onClick={() => void onAdd(c.taskId)}
              data-testid={`add-task-modal-add-${c.taskId}`}
              className="h-8 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white transition hover:bg-indigo-700"
            >
              今日やる
            </button>
            <button
              type="button"
              onClick={() => void onMarkDone(c.taskId)}
              data-testid={`add-task-modal-mark-done-${c.taskId}`}
              className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-600 transition hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700"
            >
              完了にする
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
