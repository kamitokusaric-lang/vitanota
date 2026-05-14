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
  surveyDistribution: {
    organizeScore: Array<{ score: number; count: number }>;
    inputBurdenScore: Array<{ score: number; count: number }>;
  };
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
  sessions: SessionDetail[];
}

// セッション詳細 (system_admin のみ閲覧、chimo 2026-05-14 指示で踏み絵から外す)
export interface SessionDetail {
  id: string;
  type: string;
  status: 'draft' | 'confirmed' | 'discarded';
  createdAt: string;
  inputText: string;
  inputTextRedacted: string | null;
  promptVersion: string | null;
  extraction: {
    tasks: Array<{
      title: string;
      categoryId: string | null;
      dueDate: string | null;
      memo: string;
      confidence: string;
    }>;
    needsConfirmation: string[];
  } | null;
  userConfirmed: Array<{
    title: string;
    aiSuggestedTitle: string | null;
    titleChanged: boolean;
    aiSuggestedParentName: string | null;
    userSelectedParentName: string;
    categoryChanged: boolean;
    dueDate: string | null;
    aiSuggestedDueDate: string | null;
    dueDateChanged: boolean;
    taskCreated: boolean;
  }> | null;
  confirmedAt: string | null;
  discardReason: string | null;
  discardReasonText: string | null;
  discardedAt: string | null;
  survey: {
    organizeScore: number;
    inputBurdenScore: number | null;
    submittedAt: string;
  } | null;
  editReason: string | null;
  editReasonText: string | null;
}
