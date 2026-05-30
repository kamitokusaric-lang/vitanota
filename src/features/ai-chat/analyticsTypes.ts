// AI 改善 (H1 Phase B) 指標の集計レスポンス型。
// API: pages/api/system/ai-analytics.ts、表示: pages/admin/access-distribution.tsx 末尾
// (2026-05-30 chimo: AI 改善ページをアクセス分布ページに統合、期間フィルタ対応)。
//
// 踏み絵 (project_ai_sessions_visibility / feedback_observed_moment_broken):
//   - 出力は aggregate のみ。user_id / tenant_id / 個別 session は返さない
//   - 個別セッション詳細・自由コメントはこの API では返さない (エクスポートに分離)

export interface AiAnalyticsResponse {
  summary: {
    totalSessions: number;
    confirmedCount: number;
    discardedCount: number;
    draftCount: number;
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
    privacyConcernDiscardCount: number;
    privacyConcernDiscardRate: number | null;
  };
}
