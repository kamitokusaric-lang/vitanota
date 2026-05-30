// access-distribution dashboard の API response 型定義
// system_admin 向け /admin/access-distribution で使用
//
// 2026-05-30 (chimo): ヒートマップ + 折れ線を廃止し、 全メトリクスをバブルチャートで表現。
//   各点 = (date, hour) の件数。 x=日付 / y=時間帯 / 大きさ=件数 / 色=系列。
// 集計対象:
// - UU: sessions.created_at の date×hour で user_id distinct
// - AI 整理: ai_sessions の type='quick_capture' (H1 雑投げ整理) 件数
// - 日々ノート: journal_entries 件数 (sub = 非公開件数)
// - タスク: tasks.updated_at 件数 (sub = 完了件数)
// - カレンダー: calendar_events を event 種別で色分け (Unit-06)

// HeatmapTable component (汎用) が使う行型。 access-distribution の本ページでは
// 非使用になったが、 component / test / aggregator が参照するため残す。
export interface HeatmapRow {
  date: string; // YYYY-MM-DD (JST)
  hours: number[]; // length 24 (main value)
  subHours?: number[]; // length 24 (cell 内の 2 番目の数値)
}

// バブルチャートの 1 点 (単一系列メトリクス用)。 sub は任意の内訳件数 (日々ノート=非公開 / タスク=完了)
export interface MetricBubblePoint {
  date: string; // YYYY-MM-DD (JST)
  hour: number; // 0-23 (JST)
  count: number;
  sub?: number;
}

export type CalendarEventTypeKey =
  | 'view_switched'
  | 'task_moved'
  | 'task_pushed_to_next_week'
  | 'task_created_from_plus'
  | 'day_detail_opened';

// 日付 × 時間帯 × event 種別の 1 点 (カレンダーのバブル、 色=種別)
export interface CalendarScatterPoint {
  date: string; // YYYY-MM-DD (JST)
  hour: number; // 0-23 (JST)
  eventType: CalendarEventTypeKey;
  count: number;
}

export interface AccessDistributionMeta {
  start: string; // YYYY-MM-DD (JST)
  end: string; // YYYY-MM-DD (JST、 inclusive)
  periodDays: number;
  generatedAt: string; // ISO
}

export interface AccessDistributionResponse {
  uu: MetricBubblePoint[]; // count = distinct user 数 (date×hour)
  quickCapture: MetricBubblePoint[]; // H1 quick_capture 件数
  journal: MetricBubblePoint[]; // 日々ノート件数 (sub = 非公開)
  task: MetricBubblePoint[]; // タスク touch 件数 (sub = 完了)
  calendar: CalendarScatterPoint[]; // カレンダー操作 (event 種別で色分け)
  meta: AccessDistributionMeta;
}
