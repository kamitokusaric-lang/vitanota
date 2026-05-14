// AI 改善 (H1 Phase B) 画面と API で共有する集計レスポンス型。
// API: pages/api/system/ai-analytics.ts、画面: pages/admin/ai-analytics.tsx
//
// 踏み絵 (project_ai_sessions_visibility / feedback_observed_moment_broken):
//   - 出力は aggregate のみ。user_id / tenant_id は含めない
//   - 自由コメント (freeComments) は教員が書いた文章。PII 混入の可能性ありで
//     system_admin 限定表示。誰が書いたかは紐付けない (匿名集計)

export interface AiAnalyticsResponse {
  summary: {
    totalSessions: number;
    confirmedCount: number;
    discardedCount: number;
    draftCount: number;
    organizeScoreAvg: number | null;
    surveyCount: number;
  };
  editRate: {
    candidateCount: number;
    titleChanged: number;
    categoryChanged: number;
    dueDateChanged: number;
    taskCreated: number;
  };
  subMetrics: {
    candidatesPerInputAvg: number | null;
    candidatesPerInputCount: number;
    timeToConfirmSecondsAvg: number | null;
    timeToConfirmCount: number;
    uniqueUsers: number;
    reusedUsers: number;
  };
  guardrails: {
    inputBurdenScoreAvg: number | null;
    inputBurdenScoreCount: number;
    privacyConcernDiscardCount: number;
    privacyConcernDiscardRate: number | null;
  };
  promptVersions: Array<{
    promptVersion: string;
    total: number;
    confirmed: number;
    discarded: number;
    organizeScoreAvg: number | null;
  }>;
  categoryEdit: Array<{
    parentName: string;
    candidateCount: number;
    categoryChanged: number;
  }>;
  discardReasons: Array<{ reason: string; count: number }>;
  editReasons: Array<{ reason: string; count: number }>;
  freeComments: {
    discard: Array<{
      reason: string | null;
      text: string;
      at: string | null;
    }>;
    edit: Array<{
      reason: string | null;
      text: string;
      at: string | null;
    }>;
  };
}
