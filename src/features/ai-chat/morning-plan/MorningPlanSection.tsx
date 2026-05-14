// H3 morning_plan の parent コンポーネント。
//
// 役割:
//   - GET /api/ai-chat/today-plan で当日の今日のプランがあるか確認
//   - なし: MorningPlanCard を表示、クリックで CapacityModal → POST generate → PlanResultModal
//   - PlanResultModal の「始める」→ POST start → 再 fetch → TodayPlanView 表示
//   - TodayPlanView の Done → POST done → 再 fetch + toast
//   - 1 件目の Done 後にフィードバックを 1 回出す
//
// 設計憲法 (feedback_design_vocab.md / feedback_ai_output_guards.md):
//   命令しない、評価しない、軽い語彙。toast は「N つ進みました」事実ベースのみ。

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/shared/components/Toast';
import { MorningPlanCard } from './MorningPlanCard';
import { CapacityModal } from './CapacityModal';
import { PlanResultModal } from './PlanResultModal';
import { TodayPlanView } from './TodayPlanView';
import type {
  Capacity,
  Bucket,
  OutlookScore,
  TodayPlanResponse,
  MorningPlanGenerateResponse,
} from './types';

type Phase =
  | { kind: 'loading' }
  | { kind: 'no-plan'; incompleteTaskCount: number; isFirstTime: boolean }
  | { kind: 'capacity-modal'; incompleteTaskCount: number; isFirstTime: boolean }
  | { kind: 'generating' }
  | { kind: 'result-modal'; gen: MorningPlanGenerateResponse }
  | { kind: 'starting' }
  | { kind: 'has-plan'; data: TodayPlanResponse }
  | { kind: 'error'; message: string };

export function MorningPlanSection() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  // 現セッションでフィードバックを dismiss した sessionId (= 一度だけ表示の制御)
  const [feedbackDismissedFor, setFeedbackDismissedFor] = useState<string | null>(
    null,
  );
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const { showToast } = useToast();

  const fetchTodayPlan = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-chat/today-plan');
      if (res.status === 404) {
        // feature flag OFF: 何も表示しない
        setPhase({ kind: 'error', message: 'feature_disabled' });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as TodayPlanResponse;
      if (data.sessionId && data.plan) {
        setPhase({ kind: 'has-plan', data });
      } else {
        setPhase({
          kind: 'no-plan',
          incompleteTaskCount: data.incompleteAssigneeTaskCount,
          isFirstTime: !data.hasEverUsedMorningPlan,
        });
      }
    } catch {
      setPhase({ kind: 'error', message: '今日のプランの読み込みに失敗しました' });
    }
  }, []);

  useEffect(() => {
    void fetchTodayPlan();
  }, [fetchTodayPlan]);

  const openCapacity = () => {
    const incompleteTaskCount =
      phase.kind === 'no-plan' ? phase.incompleteTaskCount : 0;
    const isFirstTime =
      phase.kind === 'no-plan' ? phase.isFirstTime : false;
    setPhase({ kind: 'capacity-modal', incompleteTaskCount, isFirstTime });
  };

  const handleSelectCapacity = async (capacity: Capacity) => {
    setPhase({ kind: 'generating' });
    try {
      const res = await fetch('/api/ai-chat/morning-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'generate', capacity }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as MorningPlanGenerateResponse;
      if (data.empty || !data.sessionId) {
        showToast('今日のタスクは見当たりません', 'info');
        setPhase({ kind: 'no-plan', incompleteTaskCount: 0, isFirstTime: false });
        return;
      }
      setPhase({ kind: 'result-modal', gen: data });
    } catch {
      showToast('AI 整理に失敗しました', 'error');
      setPhase({ kind: 'no-plan', incompleteTaskCount: 0, isFirstTime: false });
    }
  };

  const handleMoveItem = async (
    taskId: string,
    toBucket: Bucket | 'excluded',
  ) => {
    if (phase.kind !== 'result-modal' || !phase.gen.sessionId) return;
    try {
      await fetch('/api/ai-chat/morning-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          sessionId: phase.gen.sessionId,
          taskId,
          toBucket,
        }),
      });
    } catch {
      // best effort、UI 上は既に移動済
    }
  };

  const handleAddTask = async (taskId: string) => {
    if (phase.kind !== 'result-modal' || !phase.gen.sessionId) return;
    try {
      await fetch('/api/ai-chat/morning-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          sessionId: phase.gen.sessionId,
          taskId,
          bucket: 'today',
        }),
      });
    } catch {
      // best effort、UI 上は既に追加済
    }
  };

  // AddTaskModal の「完了にする」: 候補タスクを既に終わっている扱いで done に更新する。
  // (今日のプランには載せない、tasks.status='done' だけ更新)
  const handleMarkTaskDone = async (taskId: string) => {
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
    } catch {
      // best effort、UI は楽観的更新
    }
  };

  const handleStart = async () => {
    if (phase.kind !== 'result-modal' || !phase.gen.sessionId) return;
    const sessionId = phase.gen.sessionId;
    setPhase({ kind: 'starting' });
    try {
      const res = await fetch('/api/ai-chat/morning-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'start', sessionId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchTodayPlan();
    } catch {
      showToast('プランの開始に失敗しました', 'error');
      setPhase({ kind: 'no-plan', incompleteTaskCount: 0, isFirstTime: false });
    }
  };

  const handleCloseResult = async () => {
    // PlanResultModal の close ボタン / Escape
    if (phase.kind === 'result-modal' && phase.gen.sessionId) {
      const sessionId = phase.gen.sessionId;
      try {
        await fetch('/api/ai-chat/morning-plan', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'close', sessionId }),
        });
      } catch {
        // best effort
      }
    }
    setPhase({ kind: 'no-plan', incompleteTaskCount: 0, isFirstTime: false });
    // closeResult 後に件数を取り直す (= 表示が "0 件" から最新へ)
    void fetchTodayPlan();
  };

  const handleToggleDone = async (taskId: string, done: boolean) => {
    if (phase.kind !== 'has-plan' || !phase.data.sessionId) return;
    const sessionId = phase.data.sessionId;
    try {
      const res = await fetch('/api/ai-chat/today-plan/done', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          taskId,
          action: done ? 'done' : 'undone',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { ok: boolean; todayDoneCount: number };
      if (done) {
        showToast(
          `おつかれさまです。${data.todayDoneCount} つ進みました。`,
          'success',
        );
      } else {
        showToast('完了を戻しました', 'info');
      }
      await fetchTodayPlan();
    } catch {
      showToast(done ? '完了の保存に失敗しました' : '戻すのに失敗しました', 'error');
    }
  };

  const handleSubmitFeedback = async (score: OutlookScore) => {
    if (phase.kind !== 'has-plan' || !phase.data.sessionId) return;
    setFeedbackSubmitting(true);
    try {
      await fetch('/api/ai-chat/today-plan/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: phase.data.sessionId,
          outlookScore: score,
        }),
      });
      await fetchTodayPlan();
    } catch {
      showToast('フィードバックの保存に失敗しました', 'error');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  // feature flag OFF (404) or loading 初期は何も表示しない
  if (phase.kind === 'error' && phase.message === 'feature_disabled') return null;
  if (phase.kind === 'loading') return null;

  const showFeedbackForCurrent =
    phase.kind === 'has-plan' &&
    !!phase.data.plan &&
    !phase.data.plan.feedbackSubmitted &&
    phase.data.sessionId !== feedbackDismissedFor;

  return (
    <>
      {phase.kind === 'no-plan' && (
        <MorningPlanCard
          onClick={openCapacity}
          incompleteTaskCount={phase.incompleteTaskCount}
          isNew={phase.isFirstTime}
        />
      )}
      {phase.kind === 'has-plan' && phase.data.plan && (
        <TodayPlanView
          sessionId={phase.data.sessionId!}
          summary={phase.data.plan.summary}
          today={phase.data.plan.today}
          optional={phase.data.plan.optional}
          doneItems={phase.data.plan.doneItems}
          showFeedback={showFeedbackForCurrent}
          feedbackSubmitting={feedbackSubmitting}
          onToggleDone={handleToggleDone}
          onSubmitFeedback={handleSubmitFeedback}
          onDismissFeedback={() =>
            setFeedbackDismissedFor(phase.data.sessionId)
          }
        />
      )}
      <CapacityModal
        open={phase.kind === 'capacity-modal' || phase.kind === 'generating'}
        onClose={() => {
          if (phase.kind === 'capacity-modal')
            setPhase({
              kind: 'no-plan',
              incompleteTaskCount: phase.incompleteTaskCount,
              isFirstTime: phase.isFirstTime,
            });
        }}
        onSelect={handleSelectCapacity}
        loading={phase.kind === 'generating'}
      />
      <PlanResultModal
        open={phase.kind === 'result-modal' || phase.kind === 'starting'}
        sessionId={phase.kind === 'result-modal' ? phase.gen.sessionId : null}
        summary={phase.kind === 'result-modal' ? phase.gen.plan.summary : ''}
        today={phase.kind === 'result-modal' ? phase.gen.plan.today : []}
        optional={phase.kind === 'result-modal' ? phase.gen.plan.optional : []}
        notShown={phase.kind === 'result-modal' ? phase.gen.plan.notShown : []}
        todayIso={new Date().toISOString().slice(0, 10)}
        onStart={handleStart}
        onMoveItem={handleMoveItem}
        onAddTask={handleAddTask}
        onMarkTaskDone={handleMarkTaskDone}
        onClose={() => void handleCloseResult()}
        starting={phase.kind === 'starting'}
      />
    </>
  );
}
