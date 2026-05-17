// AI 整理機能 (RoughCaptureSection) の初回コーチマーク。
// 入力欄 → 整理ボタン → 入力欄 の順に 3 ステップで案内する。
//
// 文言は確定 (chimo 2026-05-16):
//   1 枚目: 雑に書いてOK + 入力例
//   2 枚目: AI が候補出すだけ、すぐには登録されない
//   3 枚目: 作成前に確認・修正できる、まずは 1 つ書いてみよう
//
// 「閉じる」は正常動作 (押し付けない、feedback_design_vocab.md / observed_moment_broken)。
// 計測イベント (Shown/Advanced/Dismissed) を /api/ai-chat/events に fire-and-forget。
import { useEffect, useState } from 'react';
import { CoachmarkOverlay, type CoachmarkStep } from './CoachmarkOverlay';

export const AI_CAPTURE_COACHMARK_VERSION = 'v1-2026-05-19';

const STEPS: CoachmarkStep[] = [
  {
    targetSelector: '[data-testid=rough-capture-input]',
    body: (
      <div className="space-y-2">
        <p>頭にある仕事を、そのまま雑に書いてOKです。</p>
        <ul className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
          <li>例：</li>
          <li>・明日の授業準備</li>
          <li>・保護者連絡</li>
          <li>・提出物チェック</li>
          <li>・学年会の資料</li>
        </ul>
      </div>
    ),
    primaryLabel: '次へ',
  },
  {
    targetSelector: '[data-testid=rough-capture-submit]',
    body: <p>AIがタスク候補に整理します。すぐには登録されません。</p>,
    primaryLabel: '次へ',
  },
  {
    targetSelector: '[data-testid=rough-capture-input]',
    body: <p>作成前に確認・修正できます。まずは1つ書いてみましょう。</p>,
    primaryLabel: 'はじめる',
  },
];

export interface AiCaptureCoachmarkCallbacks {
  onAdvance: (nextStep: 1 | 2 | 3) => void; // 1-indexed (DB 永続化用)
  onDismiss: (args: {
    reason: 'skip' | 'completed' | 'outside_click';
    step: 1 | 2 | 3;
  }) => void;
}

function postEvent(body: Record<string, unknown>): void {
  // fire-and-forget. 失敗しても UX に影響しない。
  void fetch('/api/ai-chat/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

export function AiCaptureCoachmark({ onAdvance, onDismiss }: AiCaptureCoachmarkCallbacks) {
  const [currentStep, setCurrentStep] = useState(0);

  // mount 時に Shown 発火 (1 セッション 1 回)
  useEffect(() => {
    postEvent({
      event: 'ai_capture_coachmark_shown',
      version: AI_CAPTURE_COACHMARK_VERSION,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CoachmarkOverlay
      steps={STEPS}
      currentStep={currentStep}
      onAdvance={(next) => {
        const nextStep = (next + 1) as 1 | 2 | 3;
        setCurrentStep(next);
        postEvent({
          event: 'ai_capture_coachmark_advanced',
          step: nextStep,
          version: AI_CAPTURE_COACHMARK_VERSION,
        });
        onAdvance(nextStep);
      }}
      onComplete={() => {
        const step = STEPS.length as 1 | 2 | 3;
        postEvent({
          event: 'ai_capture_coachmark_dismissed',
          step,
          reason: 'completed',
          version: AI_CAPTURE_COACHMARK_VERSION,
        });
        onDismiss({ reason: 'completed', step });
      }}
      onDismiss={(reason) => {
        const step = (currentStep + 1) as 1 | 2 | 3;
        postEvent({
          event: 'ai_capture_coachmark_dismissed',
          step,
          reason,
          version: AI_CAPTURE_COACHMARK_VERSION,
        });
        onDismiss({ reason, step });
      }}
    />
  );
}
