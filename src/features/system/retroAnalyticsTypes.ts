// ふりかえり → AIリコメンドの集計レスポンス型 (system_admin 分析ページ用)。
// 踏み絵: 集計値のみ。user_id / tenant_id / 個票は含めない。

export interface RetroCategoryBreakdown {
  category: 'soudan' | 'kansha' | 'knowledge' | 'tweet' | 'none';
  surfaced: number;
  published: number;
}

export interface RetroAnalyticsResponse {
  // 計算総数と提示 (surface=true) 数。気づき提示率 = surfaced / computedTotal。
  computedTotal: number;
  surfaced: number;
  // 提示された中での本人の対応。転換率 = published / surfaced、見送り率 = dismissed / surfaced。
  published: number;
  dismissed: number;
  proposed: number;
  // 公開したうち本文/区分を変えた数 (編集率)。
  bodyChanged: number;
  categoryChanged: number;
  // 区分別 (提示された主提案区分ごとの提示数・公開数 → 区分別転換率)。
  byCategory: RetroCategoryBreakdown[];
}
