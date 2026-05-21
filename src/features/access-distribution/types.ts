// access-distribution dashboard の API response 型定義
// system_admin 向け /admin/access-distribution で使用
//
// 集計対象 (2026-05-19 刷新、 2026-05-20 morning_plan 撤去):
// - UU: sessions.created_at の date×hour matrix で user_id distinct
// - AI 利用: ai_sessions.created_at の date×hour matrix を type='quick_capture' (H1 雑投げ整理) のみ集計
// 旧 PV (AppRunner Requests metric) は HTTP リクエスト数で page view と対応しないため廃止
// 旧 morning_plan 集計は project_h3_reframing_20260520 で撤去

export interface HeatmapRow {
  date: string; // YYYY-MM-DD (JST)
  hours: number[]; // length 24 (main value)
  // optional: cell 内に括弧表示する 2 番目の数値 (例: journal の非公開件数)
  subHours?: number[]; // length 24
}

export interface AccessDistributionSummary {
  totalUu: number;
  totalQuickCaptureSessions: number; // H1
  totalJournalEntries: number; // journal 合算
  totalJournalPrivateEntries: number; // journal 非公開のみ
  totalTaskTouches: number; // task updated_at 件数
  totalTaskCompletes: number; // task completed_at 件数
  // H3-B 朝カード (morning_card_events、 chimo 2026-05-21 UU 化):
  //   全指標は期間内ユニーク先生数。 反応率 = candidateStatusChangedUu / shownUu (UI で計算)
  morningCardShownUu: number; // 朝カードを 1 回以上見た先生数 (反応率の分母)
  morningCardDismissedUu: number; // 「閉じる」 を押した先生数
  morningCardCandidateClickedUu: number; // 候補タイトルを押した先生数 (= 編集モーダルを開いた)
  morningCardCandidateStatusChangedUu: number; // 「今日やる」 / 「完了」 に動かした先生数
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
  journalHeatmap: HeatmapRow[]; // 合算 (hours) + 非公開件数 (subHours)
  taskHeatmap: HeatmapRow[]; // touch 合算 (hours) + 完了件数 (subHours)
  morningCardHeatmap: HeatmapRow[]; // 朝カード「shown」 のみ、 H3-B (chimo 2026-05-20)
  summary: AccessDistributionSummary;
  meta: AccessDistributionMeta;
}
