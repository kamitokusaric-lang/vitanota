// access-distribution dashboard の API response 型定義
// system_admin 向け /admin/access-distribution で使用

export interface HourlyDataPoint {
  hour: number; // 0-23 (JST)
  pv: number;
  uu: number;
}

export interface HeatmapRow {
  date: string; // YYYY-MM-DD (JST)
  hours: number[]; // length 24, PV per hour
}

export interface AccessDistributionSummary {
  totalPv: number;
  totalUu: number;
  peakHour: number; // 0-23 (JST)
  peakHourPv: number;
  avgPvPerHour: number;
}

export interface AccessDistributionMeta {
  start: string; // YYYY-MM-DD (JST)
  end: string; // YYYY-MM-DD (JST、 inclusive)
  periodDays: number;
  generatedAt: string; // ISO
}

export interface AccessDistributionResponse {
  hourly: HourlyDataPoint[]; // 24 entries (0:00 - 23:00)
  heatmap: HeatmapRow[];
  summary: AccessDistributionSummary;
  meta: AccessDistributionMeta;
}
