// access-distribution dashboard の API response 型定義
// system_admin 向け /admin/access-distribution で使用
//
// 集計対象 (2026-05-19 刷新):
// - UU: sessions.created_at の date×hour matrix で user_id distinct
// - AI 利用: ai_sessions.created_at の date×hour matrix を type 別 (quick_capture / morning_plan) に件数集計
// 旧 PV (AppRunner Requests metric) は HTTP リクエスト数で page view と対応しないため廃止

export interface HeatmapRow {
  date: string; // YYYY-MM-DD (JST)
  hours: number[]; // length 24
}

export interface AccessDistributionSummary {
  totalUu: number;
  totalQuickCaptureSessions: number; // H1
  totalMorningPlanSessions: number; // H3
}

export interface AccessDistributionMeta {
  start: string; // YYYY-MM-DD (JST)
  end: string; // YYYY-MM-DD (JST、 inclusive)
  periodDays: number;
  generatedAt: string; // ISO
}

export interface AccessDistributionResponse {
  uuHeatmap: HeatmapRow[];
  quickCaptureHeatmap: HeatmapRow[]; // H1
  morningPlanHeatmap: HeatmapRow[]; // H3
  summary: AccessDistributionSummary;
  meta: AccessDistributionMeta;
}
